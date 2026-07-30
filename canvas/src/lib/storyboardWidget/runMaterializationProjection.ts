import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { isPlainObject } from '@/lib/graph/value'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'

export const WORKFLOW_MATERIALIZATION_PARENT_NODE_ID_PROPERTY =
  'workflowMaterializationParentNodeId' as const
export const WORKFLOW_MATERIALIZATION_PROJECTION_SOURCE_NODE_ID_PROPERTY =
  'workflowMaterializationProjectionSourceNodeId' as const

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
