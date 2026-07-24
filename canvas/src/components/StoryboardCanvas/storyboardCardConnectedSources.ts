import { resolveWidgetNodeTitle } from '@/components/StoryboardWidget/widgetEditorTitle'
import {
  GRAPH_NODE_CARD_TEXT_FIELDS,
  type GraphNodeCardTextFieldId,
} from '@/lib/cards/graphNodeCardFields'
import {
  isCanonicalNodeIdEqual,
  parseCanonicalNodeIds,
  resolveGraphNodeByCanonicalId,
} from '@/lib/graph/canonicalNodeIds'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { applyConnectedValuesToNodeForRender } from '@/lib/render/effectiveMediaNode'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import {
  readTextSelectionWidgetEdgeProvenance,
  type TextSelectionWidgetEdgeProvenance,
} from '@/lib/storyboardWidget/textSelectionWidgetLink'
import type {
  FlowConnectedValue,
  FlowConnectedValuesBySchemaPath,
} from '@/lib/storyboardWidget/flowDataflow'

export type StoryboardCardSourceReference = {
  nodeId: string
  label: string
  edgeIds: readonly string[]
  targetFieldIds: readonly GraphNodeCardTextFieldId[]
  selectionProvenance?: readonly (TextSelectionWidgetEdgeProvenance & { edgeId: string })[]
}

export type StoryboardCardConnectedProjection = {
  renderNode: GraphNode
  sourceReferences: readonly StoryboardCardSourceReference[]
  connectedTextFieldId: GraphNodeCardTextFieldId | null
}

const textFieldIdByPropertyKey = new Map<string, GraphNodeCardTextFieldId>(
  GRAPH_NODE_CARD_TEXT_FIELDS.flatMap(field => (
    field.propertyKeys.map(propertyKey => [propertyKey, field.id] as const)
  )),
)

const resolveConnectedTextFieldId = (schemaPath: string): GraphNodeCardTextFieldId | null => {
  const normalizedPath = String(schemaPath || '').trim()
  if (!normalizedPath.startsWith('properties.')) return null
  const propertyKey = normalizedPath.slice('properties.'.length).split('.')[0] || ''
  return textFieldIdByPropertyKey.get(propertyKey) || null
}

const resolveSourceLabel = (graphData: GraphData | null, nodeId: string): string => {
  const sourceNode = resolveGraphNodeByCanonicalId(graphData, nodeId)
  return sourceNode ? resolveWidgetNodeTitle({ node: sourceNode }) : nodeId
}

const buildSourceReferences = (
  graphData: GraphData | null,
  connectedTextValues: ReadonlyArray<readonly [string, FlowConnectedValue, GraphNodeCardTextFieldId]>,
): StoryboardCardSourceReference[] => {
  const referencesByNodeId = new Map<string, {
    label: string
    edgeIds: Set<string>
    targetFieldIds: Set<GraphNodeCardTextFieldId>
  }>()
  for (const [, connected, targetFieldId] of connectedTextValues) {
    for (const source of connected.sources || []) {
      const nodeId = String(source.nodeId || '').trim()
      if (!nodeId) continue
      const reference = referencesByNodeId.get(nodeId) || {
        label: resolveSourceLabel(graphData, nodeId),
        edgeIds: new Set<string>(),
        targetFieldIds: new Set<GraphNodeCardTextFieldId>(),
      }
      const edgeId = String(source.edgeId || '').trim()
      if (edgeId) reference.edgeIds.add(edgeId)
      reference.targetFieldIds.add(targetFieldId)
      referencesByNodeId.set(nodeId, reference)
    }
  }
  return Array.from(referencesByNodeId.entries()).map(([nodeId, reference]) => ({
    nodeId,
    label: reference.label,
    edgeIds: Array.from(reference.edgeIds).sort(),
    targetFieldIds: Array.from(reference.targetFieldIds),
  }))
}

const buildSelectionProvenanceSourceReferences = (
  graphData: GraphData | null,
  targetNodeId: unknown,
): StoryboardCardSourceReference[] => {
  if (!graphData) return []
  const referencesByNodeId = new Map<string, {
    label: string
    edgeIds: Set<string>
    targetFieldIds: Set<GraphNodeCardTextFieldId>
    selectionProvenance: Array<TextSelectionWidgetEdgeProvenance & { edgeId: string }>
  }>()
  for (const edge of graphData.edges || []) {
    const provenance = readTextSelectionWidgetEdgeProvenance(edge)
    if (!provenance) continue
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    const resolvedTarget = resolveGraphNodeByCanonicalId(graphData, tgt)
    const resolvedRequestedTarget = resolveGraphNodeByCanonicalId(graphData, targetNodeId)
    if (
      !resolvedTarget
      || !resolvedRequestedTarget
      || !isCanonicalNodeIdEqual(resolvedTarget.id, resolvedRequestedTarget.id)
    ) continue
    const sourceNode = resolveGraphNodeByCanonicalId(graphData, src)
    const nodeId = parseCanonicalNodeIds(sourceNode?.id || src)[0] || ''
    if (!nodeId) continue
    const reference = referencesByNodeId.get(nodeId) || {
      label: resolveSourceLabel(graphData, nodeId),
      edgeIds: new Set<string>(),
      targetFieldIds: new Set<GraphNodeCardTextFieldId>(),
      selectionProvenance: [],
    }
    const edgeId = String(edge.id || '').trim()
    if (edgeId) reference.edgeIds.add(edgeId)
    reference.targetFieldIds.add(provenance.targetFieldId)
    reference.selectionProvenance.push({ ...provenance, edgeId })
    referencesByNodeId.set(nodeId, reference)
  }
  return Array.from(referencesByNodeId.entries()).map(([nodeId, reference]) => ({
    nodeId,
    label: reference.label,
    edgeIds: Array.from(reference.edgeIds).sort(),
    targetFieldIds: Array.from(reference.targetFieldIds),
    selectionProvenance: reference.selectionProvenance,
  }))
}

const mergeSourceReferences = (
  references: readonly StoryboardCardSourceReference[],
): StoryboardCardSourceReference[] => {
  const merged = new Map<string, {
    label: string
    edgeIds: Set<string>
    targetFieldIds: Set<GraphNodeCardTextFieldId>
    selectionProvenance: Array<TextSelectionWidgetEdgeProvenance & { edgeId: string }>
  }>()
  for (const reference of references) {
    const current = merged.get(reference.nodeId) || {
      label: reference.label,
      edgeIds: new Set<string>(),
      targetFieldIds: new Set<GraphNodeCardTextFieldId>(),
      selectionProvenance: [],
    }
    reference.edgeIds.forEach(edgeId => current.edgeIds.add(edgeId))
    reference.targetFieldIds.forEach(fieldId => current.targetFieldIds.add(fieldId))
    current.selectionProvenance.push(...(reference.selectionProvenance || []))
    merged.set(reference.nodeId, current)
  }
  return Array.from(merged.entries()).map(([nodeId, reference]) => ({
    nodeId,
    label: reference.label,
    edgeIds: Array.from(reference.edgeIds).sort(),
    targetFieldIds: Array.from(reference.targetFieldIds),
    ...(reference.selectionProvenance.length > 0
      ? { selectionProvenance: reference.selectionProvenance }
      : {}),
  }))
}

export function buildStoryboardCardConnectedProjection(args: {
  graphData: GraphData | null
  node: GraphNode
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
}): StoryboardCardConnectedProjection {
  const connectedValues = args.connectedValuesBySchemaPath || {}
  if (isRichMediaPanelNode(args.node)) {
    return {
      renderNode: applyConnectedValuesToNodeForRender({ node: args.node, connectedValuesBySchemaPath: connectedValues }),
      sourceReferences: [],
      connectedTextFieldId: null,
    }
  }

  const renderValues: FlowConnectedValuesBySchemaPath = {}
  const connectedTextValues: Array<readonly [string, FlowConnectedValue, GraphNodeCardTextFieldId]> = []
  for (const [schemaPath, connected] of Object.entries(connectedValues)) {
    const textFieldId = resolveConnectedTextFieldId(schemaPath)
    if (textFieldId) connectedTextValues.push([schemaPath, connected, textFieldId])
    else renderValues[schemaPath] = connected
  }
  const connectedSourceReferences = buildSourceReferences(args.graphData, connectedTextValues)
  const provenanceSourceReferences = buildSelectionProvenanceSourceReferences(
    args.graphData,
    args.node.id,
  )
  const sourceReferences = mergeSourceReferences([
    ...connectedSourceReferences,
    ...provenanceSourceReferences,
  ])
  return {
    renderNode: applyConnectedValuesToNodeForRender({ node: args.node, connectedValuesBySchemaPath: renderValues }),
    sourceReferences,
    connectedTextFieldId:
      connectedTextValues[0]?.[2]
      || provenanceSourceReferences[0]?.targetFieldIds[0]
      || null,
  }
}
