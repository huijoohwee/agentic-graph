import React from 'react'

import { StoryboardWidgetPanelChromeHeader } from '@/components/StoryboardWidget/StoryboardWidgetPanelChrome'
import { getStoryboardWidgetPanelSurfaceChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { FloatingPanel } from '@/components/ui/FloatingPanel'
import { useGraphStore } from '@/hooks/useGraphStore'
import { activateMultiNodeSelectModeForShift, resolveNodeSelectionGesture } from '@/lib/canvas/nodeSelectionGesture'
import { collectSelectedGroupIds, collectSelectedNodeIds } from '@/lib/canvas/selectionGrouping'
import type { GraphData } from '@/lib/graph/types'
import { readSubgraphs, subgraphGroupId, type UserSubgraph } from '@/lib/graph/subgraphs'

type ScreenBox = { left: number; top: number; width: number; height: number }

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

const sameBox = (left: ScreenBox | undefined, right: ScreenBox): boolean => (
  !!left
  && Math.abs(left.left - right.left) < 0.25
  && Math.abs(left.top - right.top) < 0.25
  && Math.abs(left.width - right.width) < 0.25
  && Math.abs(left.height - right.height) < 0.25
)

export function StoryboardGroupPanelLayer2d(props: {
  active: boolean
  graphData: GraphData | null
  getRuntime: () => FlowNativeRuntime | null
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
  const [screenBoxByGroupId, setScreenBoxByGroupId] = React.useState<Record<string, ScreenBox>>({})

  React.useEffect(() => {
    if (!props.active || groups.length === 0) {
      setScreenBoxByGroupId({})
      return
    }
    let frame = 0
    const project = () => {
      const runtime = getRuntimeRef.current()
      const transform = runtime?.transform
      if (runtime && transform && Number.isFinite(transform.k) && transform.k > 0) {
        const next: Record<string, ScreenBox> = {}
        groups.forEach(group => {
          const groupId = subgraphGroupId(group.id)
          const aabb = runtime.groupAabbByIdCache.get(groupId)
          if (!aabb) return
          next[groupId] = {
            left: transform.x + aabb.minX * transform.k,
            top: transform.y + aabb.minY * transform.k,
            width: Math.max(1, (aabb.maxX - aabb.minX) * transform.k),
            height: Math.max(1, (aabb.maxY - aabb.minY) * transform.k),
          }
        })
        setScreenBoxByGroupId(previous => {
          const previousIds = Object.keys(previous)
          const nextIds = Object.keys(next)
          if (previousIds.length === nextIds.length && nextIds.every(id => sameBox(previous[id], next[id]))) return previous
          return next
        })
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
        const box = screenBoxByGroupId[groupId]
        if (!box) return null
        const selected = selectedIds.has(groupId)
        return (
          <FloatingPanel
            key={group.id}
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
            data-node-id={groupId}
            data-selected={selected ? 'true' : 'false'}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              zIndex: 1 + readGroupDepth(group, groupById),
            }}
            onPointerDown={event => {
              event.stopPropagation()
              selectGroupPanel(groupId, event)
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
