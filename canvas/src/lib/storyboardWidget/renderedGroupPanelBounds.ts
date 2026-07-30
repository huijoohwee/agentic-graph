import type { GraphData } from '@/lib/graph/types'
import type { UserSubgraph } from '@/lib/graph/subgraphs'
import { readWorkflowMaterializationParentNodeId } from '@/lib/storyboardWidget/runMaterializationProjection'

export type StoryboardGroupPanelScreenRect = {
  bottom: number
  left: number
  right: number
  top: number
}

export type StoryboardGroupPanelRenderedBox = {
  height: number
  left: number
  top: number
  width: number
}

const cleanId = (value: unknown): string => String(value || '').trim()

/**
 * Resolves nested group members and generated projection children together.
 * The latter keeps the rendered group complete if persisted group metadata is
 * briefly behind the publication-parent relationship during a Run.
 */
export function collectStoryboardGroupPanelMemberNodeIds(args: {
  graphData: GraphData | null | undefined
  groupId: string
  groups: readonly UserSubgraph[]
}): string[] {
  const groupId = cleanId(args.groupId)
  if (!groupId) return []
  const groupById = new Map(args.groups.map(group => [group.id, group] as const))
  const memberNodeIds = new Set<string>()
  const pendingGroupIds = [groupId]
  const visitedGroupIds = new Set<string>()
  while (pendingGroupIds.length > 0 && visitedGroupIds.size < 200) {
    const nextGroupId = cleanId(pendingGroupIds.pop())
    if (!nextGroupId || visitedGroupIds.has(nextGroupId)) continue
    visitedGroupIds.add(nextGroupId)
    groupById.get(nextGroupId)?.memberNodeIds.forEach(nodeId => {
      const id = cleanId(nodeId)
      if (id) memberNodeIds.add(id)
    })
    args.groups.forEach(candidate => {
      if (candidate.parentId === nextGroupId) pendingGroupIds.push(candidate.id)
    })
  }

  const graphNodes = args.graphData?.nodes || []
  let changed = true
  let pass = 0
  while (changed && pass <= graphNodes.length) {
    changed = false
    pass += 1
    graphNodes.forEach(node => {
      const nodeId = cleanId(node.id)
      const projectionParentNodeId = readWorkflowMaterializationParentNodeId(node)
      if (
        !nodeId
        || memberNodeIds.has(nodeId)
        || !projectionParentNodeId
        || !memberNodeIds.has(projectionParentNodeId)
      ) return
      memberNodeIds.add(nodeId)
      changed = true
    })
  }
  return Array.from(memberNodeIds).sort((left, right) => left.localeCompare(right))
}

export function computeStoryboardGroupPanelRenderedBox(args: {
  memberRects: readonly StoryboardGroupPanelScreenRect[]
  padding?: number
  surfaceRect: Pick<StoryboardGroupPanelScreenRect, 'left' | 'top'>
}): StoryboardGroupPanelRenderedBox | null {
  const memberRects = args.memberRects.filter(rect => (
    [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
    && rect.right > rect.left
    && rect.bottom > rect.top
  ))
  if (
    memberRects.length === 0
    || !Number.isFinite(args.surfaceRect.left)
    || !Number.isFinite(args.surfaceRect.top)
  ) return null

  const padding = Number.isFinite(args.padding) ? Math.max(0, Number(args.padding)) : 24
  const left = Math.min(...memberRects.map(rect => rect.left))
  const top = Math.min(...memberRects.map(rect => rect.top))
  const right = Math.max(...memberRects.map(rect => rect.right))
  const bottom = Math.max(...memberRects.map(rect => rect.bottom))
  return {
    left: left - args.surfaceRect.left - padding,
    top: top - args.surfaceRect.top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  }
}
