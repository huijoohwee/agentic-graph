import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { readSubgraphs, writeSubgraphs, type UserSubgraph } from '@/lib/graph/subgraphs'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { isPlainObject } from '@/lib/graph/value'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'

export const WORKFLOW_MATERIALIZATION_PARENT_NODE_ID_PROPERTY =
  'workflowMaterializationParentNodeId' as const
export const WORKFLOW_MATERIALIZATION_PROJECTION_SOURCE_NODE_ID_PROPERTY =
  'workflowMaterializationProjectionSourceNodeId' as const
export const WORKFLOW_MATERIALIZATION_GROUP_ID_PREFIX =
  'workflow-materialization:' as const

const cleanId = (value: unknown): string => String(unwrapGraphCellValue(value) ?? '').trim()

const isTypedPropertyEnvelope = (
  value: unknown,
): value is Record<string, unknown> & { value: unknown } => (
  isPlainObject(value)
  && Object.prototype.hasOwnProperty.call(value, 'value')
  && (
    Object.prototype.hasOwnProperty.call(value, 'key')
    || Object.prototype.hasOwnProperty.call(value, 'type')
  )
)

const readLogicalProperties = (properties: unknown): Record<string, unknown> => {
  if (!isPlainObject(properties)) return {}
  if (isTypedPropertyEnvelope(properties) && isPlainObject(properties.value)) {
    return properties.value
  }
  return properties
}

const mergeProperty = (
  properties: unknown,
  key: string,
  value: unknown,
): Record<string, unknown> => {
  const raw = isPlainObject(properties) ? properties : {}
  const current = readLogicalProperties(raw)
  const existing = current[key]
  const nextValue = isTypedPropertyEnvelope(existing)
    ? { ...existing, value }
    : value
  const next = { ...current, [key]: nextValue }
  if (!isTypedPropertyEnvelope(raw) || !isPlainObject(raw.value)) return next
  const container = { ...raw, value: next }
  delete container[key]
  return container
}

export function readWorkflowMaterializationProjectionSourceNodeId(
  properties: unknown,
): string {
  return cleanId(
    readLogicalProperties(properties)[WORKFLOW_MATERIALIZATION_PROJECTION_SOURCE_NODE_ID_PROPERTY],
  )
}

export function readWorkflowMaterializationParentNodeId(
  node: Pick<GraphNode, 'properties'> | null | undefined,
): string {
  return cleanId(
    readLogicalProperties(node?.properties)[WORKFLOW_MATERIALIZATION_PARENT_NODE_ID_PROPERTY],
  )
}

/**
 * Adds a presentation parent without replacing the graph's semantic parent.
 * The semantic edge continues to drive execution and lineage; the projection
 * source is consumed only by the Storyboard overlay renderer.
 */
export function applyWorkflowMaterializationProjectionParent(args: {
  graphData: GraphData
  semanticParentNodeId: string
  projectionParentNodeId: string
  childNodeIds: readonly string[]
}): GraphData {
  const semanticParentNodeId = cleanId(args.semanticParentNodeId)
  const projectionParentNodeId = cleanId(args.projectionParentNodeId)
  const childNodeIds = new Set(args.childNodeIds.map(cleanId).filter(Boolean))
  if (
    !semanticParentNodeId
    || !projectionParentNodeId
    || semanticParentNodeId === projectionParentNodeId
    || childNodeIds.size === 0
  ) return args.graphData

  let changed = false
  const nodes = (args.graphData.nodes || []).map(node => {
    const nodeId = cleanId(node.id)
    if (!childNodeIds.has(nodeId)) return node
    if (readWorkflowMaterializationParentNodeId(node) === projectionParentNodeId) return node
    changed = true
    return {
      ...node,
      properties: mergeProperty(
        node.properties,
        WORKFLOW_MATERIALIZATION_PARENT_NODE_ID_PROPERTY,
        projectionParentNodeId,
      ) as never,
    }
  })
  const edges = (args.graphData.edges || []).map(edge => {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (cleanId(src) !== semanticParentNodeId || !childNodeIds.has(cleanId(tgt))) return edge
    if (
      readWorkflowMaterializationProjectionSourceNodeId(edge.properties)
      === projectionParentNodeId
    ) return edge
    changed = true
    return {
      ...edge,
      properties: mergeProperty(
        edge.properties,
        WORKFLOW_MATERIALIZATION_PROJECTION_SOURCE_NODE_ID_PROPERTY,
        projectionParentNodeId,
      ) as never,
    }
  })
  return changed
    ? bumpStoryboardWidgetDraftGraphDataRevision({ ...args.graphData, nodes, edges })
    : args.graphData
}

/**
 * Keeps the generated projection parent and its materialized children inside
 * one auto-bounded Group Panel. An existing exact child-only Group Panel is
 * adopted so a Run does not leave overlapping group shells behind.
 */
export function applyWorkflowMaterializationGroupPanel(args: {
  graphData: GraphData
  projectionParentNodeId: string
  childNodeIds: readonly string[]
  outputGroupId?: string | null
  groupLabel?: string | null
}): GraphData {
  const projectionParentNodeId = cleanId(args.projectionParentNodeId)
  const availableNodeIds = new Set(
    (args.graphData.nodes || []).map(node => cleanId(node.id)).filter(Boolean),
  )
  const childNodeIds = Array.from(new Set(
    args.childNodeIds
      .map(cleanId)
      .filter(nodeId => nodeId && nodeId !== projectionParentNodeId && availableNodeIds.has(nodeId)),
  )).sort((a, b) => a.localeCompare(b))
  if (
    !projectionParentNodeId
    || !availableNodeIds.has(projectionParentNodeId)
    || childNodeIds.length === 0
  ) return args.graphData

  const desiredMemberNodeIds = [projectionParentNodeId, ...childNodeIds]
    .sort((a, b) => a.localeCompare(b))
  const desiredMemberNodeIdSet = new Set(desiredMemberNodeIds)
  const stableGroupKey = cleanId(args.outputGroupId) || projectionParentNodeId
  const desiredGroupId = `${WORKFLOW_MATERIALIZATION_GROUP_ID_PREFIX}${stableGroupKey}`
  const subgraphs = readSubgraphs(args.graphData)
  const exactGroup = subgraphs.find(subgraph => subgraph.id === desiredGroupId)
  const adoptableGroup = exactGroup || subgraphs
    .filter(subgraph => (
      childNodeIds.every(nodeId => subgraph.memberNodeIds.includes(nodeId))
      && subgraph.memberNodeIds.every(nodeId => desiredMemberNodeIdSet.has(nodeId))
    ))
    .sort((left, right) => (
      left.memberNodeIds.length - right.memberNodeIds.length
      || left.id.localeCompare(right.id)
    ))[0]
  const nextMemberNodeIds = Array.from(new Set([
    ...(adoptableGroup?.memberNodeIds || []),
    ...desiredMemberNodeIds,
  ])).sort((a, b) => a.localeCompare(b))
  const groupLabel = cleanId(args.groupLabel) || 'Generated outputs'

  if (
    adoptableGroup
    && adoptableGroup.autoBounds === true
    && adoptableGroup.memberNodeIds.length === nextMemberNodeIds.length
    && adoptableGroup.memberNodeIds.every((nodeId, index) => nodeId === nextMemberNodeIds[index])
  ) return args.graphData

  const nextGroup: UserSubgraph = adoptableGroup
    ? {
        ...adoptableGroup,
        memberNodeIds: nextMemberNodeIds,
        autoBounds: true,
      }
    : {
        id: desiredGroupId,
        label: groupLabel,
        memberNodeIds: nextMemberNodeIds,
        parentId: null,
        kind: 'subgraph',
        autoBounds: true,
      }
  const nextSubgraphs = adoptableGroup
    ? subgraphs.map(subgraph => subgraph.id === adoptableGroup.id ? nextGroup : subgraph)
    : [...subgraphs, nextGroup]
  return bumpStoryboardWidgetDraftGraphDataRevision(
    writeSubgraphs(args.graphData, nextSubgraphs),
  )
}
