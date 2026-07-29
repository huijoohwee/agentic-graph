import type { GraphData } from '@/lib/graph/types'
import { readSubgraphs, subgraphIdFromGroupId, type UserSubgraph } from '@/lib/graph/subgraphs'
import type { CanvasBounds } from '@/lib/canvas/parentChildRelation'
import { DEFAULT_GROUP_NESTED_PADDING_STEP } from '@/lib/graph/layoutDefaults'

export type SubFlowDropCandidate = {
  groupId: string
  subgraphId: string
  parentGroupId?: string | null
  depth: number
  bounds: CanvasBounds
}

export const computeNestedGroupPadding = (args: {
  basePadding: number
  group: { depth?: number }
  groups: ReadonlyArray<{ depth?: number }>
  nestedPaddingStep?: number
}): number => {
  const depth = typeof args.group.depth === 'number' && Number.isFinite(args.group.depth)
    ? Math.max(0, Math.floor(args.group.depth))
    : 0
  const maxDepth = args.groups.reduce((max, candidate) => {
    const candidateDepth = typeof candidate.depth === 'number' && Number.isFinite(candidate.depth)
      ? Math.max(0, Math.floor(candidate.depth))
      : 0
    return Math.max(max, candidateDepth)
  }, depth)
  const basePadding = Number.isFinite(args.basePadding) ? Math.max(0, args.basePadding) : 0
  const nestedPaddingStep = typeof args.nestedPaddingStep === 'number' && Number.isFinite(args.nestedPaddingStep)
    ? Math.max(0, args.nestedPaddingStep)
    : DEFAULT_GROUP_NESTED_PADDING_STEP
  return basePadding + nestedPaddingStep * Math.max(0, maxDepth - depth)
}

const isFiniteBounds = (bounds: CanvasBounds): boolean =>
  Number.isFinite(bounds.minX) &&
  Number.isFinite(bounds.minY) &&
  Number.isFinite(bounds.maxX) &&
  Number.isFinite(bounds.maxY) &&
  bounds.maxX > bounds.minX &&
  bounds.maxY > bounds.minY

const isDescendantGroup = (
  candidateGroupId: string,
  ancestorGroupId: string,
  parentGroupIdById: ReadonlyMap<string, string | null>,
): boolean => {
  let cursor = candidateGroupId
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor)) {
    if (cursor === ancestorGroupId) return true
    seen.add(cursor)
    cursor = parentGroupIdById.get(cursor) || ''
  }
  return false
}

export const selectSubFlowParentDropTarget = (args: {
  groupId: string
  groupBounds: CanvasBounds
  candidates: SubFlowDropCandidate[]
}): SubFlowDropCandidate | null => {
  const groupId = String(args.groupId || '').trim()
  if (!groupId || !isFiniteBounds(args.groupBounds)) return null
  const centerX = (args.groupBounds.minX + args.groupBounds.maxX) / 2
  const centerY = (args.groupBounds.minY + args.groupBounds.maxY) / 2
  const parentGroupIdById = new Map<string, string | null>()
  for (const candidate of args.candidates) {
    const id = String(candidate?.groupId || '').trim()
    if (!id) continue
    const parentId = String(candidate.parentGroupId || '').trim()
    parentGroupIdById.set(id, parentId || null)
  }
  const eligible = args.candidates.filter(candidate => {
    if (!candidate || !isFiniteBounds(candidate.bounds)) return false
    const candidateId = String(candidate.groupId || '').trim()
    if (!candidateId || candidateId === groupId) return false
    if (isDescendantGroup(candidateId, groupId, parentGroupIdById)) return false
    return (
      centerX >= candidate.bounds.minX &&
      centerX <= candidate.bounds.maxX &&
      centerY >= candidate.bounds.minY &&
      centerY <= candidate.bounds.maxY
    )
  })
  eligible.sort((a, b) => {
    if (a.depth !== b.depth) return b.depth - a.depth
    const areaA = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY)
    const areaB = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY)
    if (areaA !== areaB) return areaA - areaB
    return a.groupId.localeCompare(b.groupId)
  })
  return eligible[0] || null
}

export const findUserSubgraphParent = (
  graphData: GraphData | null | undefined,
  rawGroupId: string | null | undefined,
): { child: UserSubgraph; parent: UserSubgraph } | null => {
  const childId = subgraphIdFromGroupId(String(rawGroupId || '').trim())
  if (!childId) return null
  const subgraphs = readSubgraphs(graphData)
  const child = subgraphs.find(subgraph => subgraph.id === childId) || null
  const parentId = String(child?.parentId || '').trim()
  const parent = parentId ? subgraphs.find(subgraph => subgraph.id === parentId) || null : null
  return child && parent ? { child, parent } : null
}
