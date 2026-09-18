import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { DiagramSelectionRow } from '@/lib/diagram/diagramRowSelection'
import type { MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { readGanttTaskTokens } from '@/lib/mermaid/mermaidGanttTimelineModel'
import { readNodeProperties, unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

export const normalizeGanttGraphSelectionKey = (value: unknown): string => (
  String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
)

const isGanttTaskMetadataToken = (value: unknown): boolean => {
  const token = String(value || '').trim()
  if (!token) return true
  if (/^(?:active|after|crit|done|kgpos_\d|milestone|until|vert)$/i.test(token)) return true
  if (/^\d+(?:\.\d+)?[dhmsw]$/i.test(token)) return true
  if (/^\d{1,2}:\d{2}$/.test(token)) return true
  return false
}

export const readGanttGraphTaskId = (raw: unknown): string => {
  const tokens = readGanttTaskTokens(String(raw || ''))
  return tokens.find(token => !isGanttTaskMetadataToken(token)) || ''
}

const buildComparableTaskKeys = (args: {
  label?: unknown
  raw?: unknown
}): Set<string> => {
  const keys = new Set<string>()
  const push = (value: unknown) => {
    const key = normalizeGanttGraphSelectionKey(value)
    if (key) keys.add(key)
  }
  const taskId = readGanttGraphTaskId(args.raw)
  push(taskId)
  const taskKey = normalizeGanttGraphSelectionKey(taskId)
  const parts = taskKey.split('_').filter(Boolean)
  for (let index = 1; index < parts.length - 1; index += 1) {
    push(parts.slice(index).join('_'))
  }
  push(args.label)
  return keys
}

const readNodeComparableValues = (node: GraphNode): unknown[] => {
  const props = readNodeProperties(node)
  return [
    node.id,
    node.label,
    node.type,
    props.id,
    props.key,
    props.title,
    props.name,
    props.label,
    props.semanticKey,
    props.strybldrElementId,
  ].map(value => unwrapGraphCellValue(value))
}

const scoreNodeForTaskKeys = (node: GraphNode, taskKeys: Set<string>, primaryTaskKey: string, labelKey: string): number => {
  const nodeKeys = readNodeComparableValues(node)
    .map(normalizeGanttGraphSelectionKey)
    .filter(Boolean)
  if (!nodeKeys.length) return 0
  if (primaryTaskKey && nodeKeys.includes(primaryTaskKey)) return 100
  for (const taskKey of taskKeys) {
    if (taskKey && nodeKeys.includes(taskKey)) return 90
  }
  if (labelKey && nodeKeys.includes(labelKey)) return 80
  return 0
}

export function resolveGraphNodeIdForGanttTaskDescriptor(args: {
  graphData: Pick<GraphData, 'nodes'> | null | undefined
  label?: unknown
  raw?: unknown
}): string {
  const nodes = Array.isArray(args.graphData?.nodes) ? args.graphData.nodes : []
  if (!nodes.length) return ''
  const primaryTaskKey = normalizeGanttGraphSelectionKey(readGanttGraphTaskId(args.raw))
  const labelKey = normalizeGanttGraphSelectionKey(args.label)
  const taskKeys = buildComparableTaskKeys({ label: args.label, raw: args.raw })
  if (!taskKeys.size) return ''
  let bestNodeId = ''
  let bestScore = 0
  for (const node of nodes) {
    const nodeId = String(node?.id || '').trim()
    if (!nodeId) continue
    const score = scoreNodeForTaskKeys(node, taskKeys, primaryTaskKey, labelKey)
    if (score <= bestScore) continue
    bestNodeId = nodeId
    bestScore = score
  }
  return bestNodeId
}

export function resolveGraphNodeIdForGanttDiagramRow(args: {
  graphData: Pick<GraphData, 'nodes'> | null | undefined
  row: Pick<DiagramSelectionRow, 'label' | 'raw'> | null | undefined
}): string {
  return resolveGraphNodeIdForGanttTaskDescriptor({
    graphData: args.graphData,
    label: args.row?.label,
    raw: args.row?.raw,
  })
}

export function resolveGraphNodeIdForGanttTaskSpan(args: {
  graphData: Pick<GraphData, 'nodes'> | null | undefined
  span: Pick<MermaidGanttTimelineTaskSpan, 'label' | 'raw'> | null | undefined
}): string {
  return resolveGraphNodeIdForGanttTaskDescriptor({
    graphData: args.graphData,
    label: args.span?.label,
    raw: args.span?.raw,
  })
}
