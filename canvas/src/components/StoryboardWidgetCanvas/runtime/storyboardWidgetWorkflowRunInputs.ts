import { computeFlowConnectedValuesBySchemaPath, type FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { setObjectPath } from '@/lib/data/objectPath'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { readFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'
import { readTextSelectionWidgetEdgeProvenance } from '@/lib/storyboardWidget/textSelectionWidgetLink'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry, WidgetRegistryPort } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { resolveWidgetNodeTitle } from '@/components/StoryboardWidget/widgetEditorTitle'

import { type StoryboardWidgetWorkflowNodeResolutionContext } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'

export type StoryboardWidgetWorkflowConnectedValuesInput = {
  graphData: GraphData
  targetNodeId: string
  connectedValuesByNodeId: Map<string, FlowConnectedValuesBySchemaPath>
}

export const STORYBOARD_WIDGET_TEXT_SOURCE_PROVENANCE_SCHEMA = 'agenticgraph-text-generation-source-provenance/v1'

export type StoryboardWidgetTextSourceContext = {
  reference: string
  label: string
  nodeType: string
  sourcePort: string
  targetPath: string
  selection: {
    documentPath: string
    startLine: number
    endLine: number
  } | null
  content: string
}

function cleanString(value: unknown): string {
  const scalar = unwrapGraphCellValue(value)
  return typeof scalar === 'string' ? scalar.trim() : ''
}

export function normalizeStoryboardWidgetConnectedTextValue(value: unknown): string {
  const scalar = unwrapGraphCellValue(value)
  if (typeof scalar === 'string') return scalar.trim()
  return Array.isArray(scalar)
    ? scalar.map(item => normalizeStoryboardWidgetConnectedTextValue(item)).filter(Boolean).join('\n').trim()
    : ''
}

export function resolveStoryboardWidgetTextGenerationPrompts(args: {
  authoredPrompt: unknown
  connectedValue: unknown
  sourceContexts?: readonly StoryboardWidgetTextSourceContext[]
}): { authoredPrompt: string; connectedPrompt: string; prompt: string } {
  const authoredPrompt = normalizeStoryboardWidgetConnectedTextValue(args.authoredPrompt)
  const sourceContexts = (args.sourceContexts || []).filter(source => source.content.trim())
  const connectedPrompt = sourceContexts.length > 0
    ? sourceContexts.map(source => source.content).join('\n').trim()
    : normalizeStoryboardWidgetConnectedTextValue(args.connectedValue)
  if (!authoredPrompt || !connectedPrompt) {
    return { authoredPrompt, connectedPrompt, prompt: authoredPrompt || connectedPrompt }
  }
  const connectedContext = sourceContexts.length > 0
    ? JSON.stringify({
        schema: STORYBOARD_WIDGET_TEXT_SOURCE_PROVENANCE_SCHEMA,
        sources: sourceContexts,
      }, null, 2)
    : connectedPrompt
  const prompt = [
    '<connected-source-context>',
    connectedContext,
    '</connected-source-context>',
    '',
    '<user-authored-request>',
    authoredPrompt,
    '</user-authored-request>',
  ].join('\n')
  return { authoredPrompt, connectedPrompt, prompt }
}

export function resolveStoryboardWidgetTextSourceContexts(args: {
  graphData: GraphData | null | undefined
  connectedValue: {
    value: unknown
    sources: ReadonlyArray<{ edgeId: string; nodeId: string; portKey: string }>
  } | null | undefined
  targetPath: string
}): StoryboardWidgetTextSourceContext[] {
  const sources = args.connectedValue?.sources || []
  const scalar = unwrapGraphCellValue(args.connectedValue?.value)
  const values = Array.isArray(scalar) && scalar.length === sources.length
    ? scalar
    : sources.map(() => scalar)
  const contexts: StoryboardWidgetTextSourceContext[] = []
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!
    const sourceNode = resolveGraphNodeByCanonicalId(args.graphData, source.nodeId)
    const edge = (args.graphData?.edges || []).find(candidate => cleanString(candidate.id) === cleanString(source.edgeId))
    const selection = readTextSelectionWidgetEdgeProvenance(edge)
    const content = selection?.selectedText || normalizeStoryboardWidgetConnectedTextValue(values[index])
    if (!content) continue
    contexts.push({
      reference: `source-${contexts.length + 1}`,
      label: sourceNode ? resolveWidgetNodeTitle({ node: sourceNode }) : '',
      nodeType: cleanString(sourceNode?.type),
      sourcePort: cleanString(source.portKey),
      targetPath: cleanString(args.targetPath),
      selection: selection ? {
        documentPath: selection.documentPath,
        startLine: selection.startLine,
        endLine: selection.endLine,
      } : null,
      content,
    })
  }
  return contexts
}

export function serializeStoryboardWidgetTextSourceProvenance(
  sourceContexts: readonly StoryboardWidgetTextSourceContext[],
): string {
  return sourceContexts.length > 0
    ? JSON.stringify({
        schema: STORYBOARD_WIDGET_TEXT_SOURCE_PROVENANCE_SCHEMA,
        sources: sourceContexts,
      })
    : ''
}

function normalizeWorkflowSchemaPath(schemaPath: unknown, fallbackKey = ''): string {
  const raw = cleanString(schemaPath) || cleanString(fallbackKey)
  if (!raw) return ''
  if (raw.startsWith('properties') || raw.startsWith('metadata') || raw === 'label' || raw === 'type') return raw
  return `properties.${raw}`
}

function collectOutputSchemaPaths(entry: WidgetRegistryEntry | null | undefined): Set<string> {
  const out = new Set<string>()
  const ports = Array.isArray(entry?.ports) ? entry.ports as WidgetRegistryPort[] : []
  for (const port of ports) {
    if (port?.direction !== 'output') continue
    const schemaPath = normalizeWorkflowSchemaPath(port.schemaPath, port.portKey)
    if (schemaPath) out.add(schemaPath)
  }
  return out
}

function materializeInlineComputeOutputSchemaPath(args: {
  schemaPath: string
  outputSchemaPaths: ReadonlySet<string>
}): string {
  const dataPrefix = 'properties.data.'
  if (!args.schemaPath.startsWith(dataPrefix)) return args.schemaPath
  const propertyKey = args.schemaPath.slice(dataPrefix.length).trim()
  if (!propertyKey) return ''
  const materializedPath = `properties.${propertyKey}`
  return args.outputSchemaPaths.size === 0 || args.outputSchemaPaths.has(materializedPath)
    ? materializedPath
    : ''
}

export function buildStoryboardWidgetInlineComputeOutputPatch(args: {
  node: GraphNode | null
  registryEntry?: WidgetRegistryEntry | null
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath | null
  currentProperties: Record<string, unknown>
}): Record<string, unknown> | null {
  if (!args.node || !readFlowComputeSource(args.node)) return null
  const connectedValuesBySchemaPath = args.connectedValuesBySchemaPath || {}
  const outputSchemaPaths = collectOutputSchemaPaths(args.registryEntry)
  let nextRoot: { properties: Record<string, unknown> } = { properties: { ...args.currentProperties } }
  let changed = false
  for (const [schemaPathRaw, connected] of Object.entries(connectedValuesBySchemaPath)) {
    const schemaPath = normalizeWorkflowSchemaPath(schemaPathRaw)
    if (!schemaPath) continue
    const isDeclaredOutput = outputSchemaPaths.has(schemaPath)
    const isComputedDataOutput = outputSchemaPaths.size === 0 && schemaPath.startsWith('properties.data.')
    if (!isDeclaredOutput && !isComputedDataOutput) continue
    if (Object.is(connected?.value, undefined)) continue
    const materializedPath = materializeInlineComputeOutputSchemaPath({ schemaPath, outputSchemaPaths })
    if (!materializedPath) continue
    nextRoot = setObjectPath(nextRoot, materializedPath, connected.value)
    changed = true
  }
  return changed ? nextRoot.properties : null
}

export function resolveStoryboardWidgetWorkflowConnectedValuesInput(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData | null
  writableNodeId: string
  registry: WidgetRegistryEntry[]
  preserveMaterializedOutputs?: boolean
}): StoryboardWidgetWorkflowConnectedValuesInput | null {
  const writableNodeId = String(args.writableNodeId || '').trim()
  if (!writableNodeId) return null

  const candidateGraphs: GraphData[] = []
  if (args.context.renderGraph) candidateGraphs.push(args.context.renderGraph)
  if (args.graphForRun && args.graphForRun !== args.context.renderGraph) candidateGraphs.unshift(args.graphForRun)
  if (args.graphForRun && !candidateGraphs.includes(args.graphForRun)) candidateGraphs.push(args.graphForRun)
  if (args.context.draftGraph && !candidateGraphs.includes(args.context.draftGraph)) candidateGraphs.push(args.context.draftGraph)
  if (args.context.storeGraph && !candidateGraphs.includes(args.context.storeGraph)) candidateGraphs.push(args.context.storeGraph)
  if (args.context.baseGraph && !candidateGraphs.includes(args.context.baseGraph)) candidateGraphs.push(args.context.baseGraph)

  for (let i = 0; i < candidateGraphs.length; i += 1) {
    const graphData = candidateGraphs[i]!
    const resolvedTargetNodeId = String(resolveGraphNodeByCanonicalId(graphData, writableNodeId)?.id || '').trim()
    if (!resolvedTargetNodeId) continue
    const connectedValuesByNodeId = computeFlowConnectedValuesBySchemaPath({
      graphData,
      graphRevision: readGraphDataRevision(graphData),
      registry: args.registry,
      targetNodeIds: new Set([resolvedTargetNodeId]),
      preserveMaterializedOutputs: args.preserveMaterializedOutputs,
    })
    return {
      graphData,
      targetNodeId: resolvedTargetNodeId,
      connectedValuesByNodeId,
    }
  }

  return null
}
