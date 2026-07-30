import {
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
  FLOW_TEXT_OUTPUT_PORT_KEY,
} from '@/lib/graph/flowPorts'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { isPlainObject } from '@/lib/graph/value'

export const WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY = 'workflowOutputEdgeMode' as const
export const WORKFLOW_OUTPUT_EDGE_MODE_MANUAL = 'manual' as const
export const WORKFLOW_OUTPUT_EDGE_DEFAULT_SOURCE_PORT_KEY = FLOW_TEXT_OUTPUT_PORT_KEY
export const WORKFLOW_OUTPUT_EDGE_DEFAULT_TARGET_PORT_KEY = 'output' as const

const cleanEdgePart = (value: unknown): string => String(value ?? '').trim()

type StoryboardWidgetWorkflowOutputEdgePropertiesArgs = {
  sourceNodeId: string
  outputKey?: string | null
  sourcePortKey?: string | null
  targetPortKey?: string | null
}

const isTypedEdgePropertiesContainer = (properties: unknown): properties is Record<string, unknown> => (
  isPlainObject(properties)
  && Object.prototype.hasOwnProperty.call(properties, 'value')
  && (Object.prototype.hasOwnProperty.call(properties, 'key') || Object.prototype.hasOwnProperty.call(properties, 'type'))
)

const readWorkflowOutputEdgeProperties = (properties: unknown): Record<string, unknown> => {
  const logical = isTypedEdgePropertiesContainer(properties) ? unwrapGraphCellValue(properties) : properties
  return isPlainObject(logical) ? logical : {}
}

const mergeWorkflowOutputEdgeProperty = (
  current: Record<string, unknown>,
  key: string,
  value: unknown,
): unknown => {
  const existing = current[key]
  return isTypedEdgePropertiesContainer(existing)
    ? { ...existing, value }
    : value
}

export function isStoryboardWidgetWorkflowOutputEdge(properties: unknown): boolean {
  return unwrapGraphCellValue(readWorkflowOutputEdgeProperties(properties).workflowOutputEdge) === true
}

export function hasCanonicalStoryboardWidgetWorkflowOutputEdgeProperties(
  properties: unknown,
  args: StoryboardWidgetWorkflowOutputEdgePropertiesArgs,
): boolean {
  const current = readWorkflowOutputEdgeProperties(properties)
  return unwrapGraphCellValue(current.workflowOutputEdge) === true
    && cleanEdgePart(unwrapGraphCellValue(current.workflowOutputAnchorNodeId)) === cleanEdgePart(args.sourceNodeId)
    && cleanEdgePart(unwrapGraphCellValue(current.workflowOutputKey)) === (cleanEdgePart(args.outputKey) || 'output')
    && cleanEdgePart(unwrapGraphCellValue(current[FLOW_EDGE_SOURCE_PORT_KEY])) === (cleanEdgePart(args.sourcePortKey) || WORKFLOW_OUTPUT_EDGE_DEFAULT_SOURCE_PORT_KEY)
    && cleanEdgePart(unwrapGraphCellValue(current[FLOW_EDGE_TARGET_PORT_KEY])) === (cleanEdgePart(args.targetPortKey) || WORKFLOW_OUTPUT_EDGE_DEFAULT_TARGET_PORT_KEY)
}

export function mergeStoryboardWidgetWorkflowOutputEdgeProperties(
  properties: unknown,
  args: StoryboardWidgetWorkflowOutputEdgePropertiesArgs,
): Record<string, unknown> {
  const raw = isPlainObject(properties) ? properties : {}
  const current = readWorkflowOutputEdgeProperties(properties)
  const next = {
    ...current,
    workflowOutputEdge: mergeWorkflowOutputEdgeProperty(current, 'workflowOutputEdge', true),
    workflowOutputAnchorNodeId: mergeWorkflowOutputEdgeProperty(current, 'workflowOutputAnchorNodeId', cleanEdgePart(args.sourceNodeId)),
    workflowOutputKey: mergeWorkflowOutputEdgeProperty(current, 'workflowOutputKey', cleanEdgePart(args.outputKey) || 'output'),
    [FLOW_EDGE_SOURCE_PORT_KEY]: mergeWorkflowOutputEdgeProperty(current, FLOW_EDGE_SOURCE_PORT_KEY, cleanEdgePart(args.sourcePortKey) || WORKFLOW_OUTPUT_EDGE_DEFAULT_SOURCE_PORT_KEY),
    [FLOW_EDGE_TARGET_PORT_KEY]: mergeWorkflowOutputEdgeProperty(current, FLOW_EDGE_TARGET_PORT_KEY, cleanEdgePart(args.targetPortKey) || WORKFLOW_OUTPUT_EDGE_DEFAULT_TARGET_PORT_KEY),
  }
  return isTypedEdgePropertiesContainer(raw)
    ? { ...raw, value: next }
    : next
}

export function buildStoryboardWidgetWorkflowOutputEdgeId(args: {
  sourceNodeId: string
  targetNodeId: string
  outputKey?: string | null
  usedEdgeIds: ReadonlySet<string>
}): string {
  const slug = ['workflow-output', args.sourceNodeId, cleanEdgePart(args.outputKey) || 'output', args.targetNodeId]
    .join('-')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180) || 'workflow-output-edge'
  if (!args.usedEdgeIds.has(slug)) return slug
  let suffix = 2
  while (args.usedEdgeIds.has(`${slug}-${suffix}`)) suffix += 1
  return `${slug}-${suffix}`
}
