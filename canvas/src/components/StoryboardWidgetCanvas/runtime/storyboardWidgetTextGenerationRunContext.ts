import { resolveWidgetRegistryEntry, FLOW_WIDGET_FORM_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { resolveEffectiveTextGenerationWidgetProperties } from '@/features/storyboard-widget-manager/registryTemplates'
import { inferTextGenerationProviderFamily } from '@/features/storyboard-widget-manager/textGenerationProviderFamily'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from './storyboardWidgetRenderGraph'
import {
  resolveStoryboardWidgetTextGenerationPrompts,
  resolveStoryboardWidgetTextSourceContexts,
  resolveStoryboardWidgetWorkflowConnectedValuesInput,
  serializeStoryboardWidgetTextSourceProvenance,
} from './storyboardWidgetWorkflowRunInputs'

export type StoryboardWidgetTextGenerationRunContext = {
  properties: Record<string, unknown>
  formId: unknown
  authoredPrompt: string
  connectedPrompt: string
  prompt: string
  connectedSourceNodeId: string
  outputSourceProvenanceJson: string
}

const TEXT_GENERATION_GLOBAL_PROPERTY_KEYS = [
  'chatProvider',
  'chatAuthMode',
  'chatEndpointUrl',
  'chatModel',
  'chatTemperature',
  'chatMaxCompletionTokens',
  'chatServiceTier',
  'chatStream',
  'chatMessagesJson',
  'chatReasoningEffort',
  'chatThinkingType',
  'chatThinkingJson',
  'chatFrequencyPenalty',
  'chatPresencePenalty',
  'chatTopP',
  'chatLogprobs',
  'chatTopLogprobs',
  'chatParallelToolCalls',
  'chatStopJson',
  'chatStreamOptionsJson',
  'chatResponseFormatJson',
  'chatLogitBiasJson',
  'chatToolsJson',
  'chatToolChoiceJson',
] as const

export function resolveStoryboardWidgetTextGenerationRunContext(args: {
  node: GraphNode
  rawNodeProperties: Record<string, unknown>
  runtimeProperties: Record<string, unknown>
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: Parameters<typeof resolveStoryboardWidgetWorkflowConnectedValuesInput>[0]['graphForRun']
  writableNodeId: string
  widgetRegistry: WidgetRegistryEntry[]
  baseGraphKind: string
}): StoryboardWidgetTextGenerationRunContext {
  const registryEntry = resolveWidgetRegistryEntry({
    node: args.node,
    registry: args.widgetRegistry,
    graphMetaKind: args.baseGraphKind,
  })
  const formId = registryEntry?.formId || args.rawNodeProperties[FLOW_WIDGET_FORM_ID_KEY]
  const providerFamily = inferTextGenerationProviderFamily({
    provider: unwrapGraphCellValue(args.rawNodeProperties.chatProvider) || args.runtimeProperties.chatProvider,
    endpointUrl: unwrapGraphCellValue(args.rawNodeProperties.chatEndpointUrl) || args.runtimeProperties.chatEndpointUrl,
    model: unwrapGraphCellValue(args.rawNodeProperties.chatModel) || args.runtimeProperties.chatModel,
    widgetTypeId: registryEntry?.widgetTypeId,
    formId,
  })
  const globalProperties = Object.fromEntries(
    TEXT_GENERATION_GLOBAL_PROPERTY_KEYS.map(key => [key, args.runtimeProperties[key]]),
  )
  const properties = resolveEffectiveTextGenerationWidgetProperties({
    providerFamily,
    localProperties: args.rawNodeProperties,
    globalProperties,
  })
  const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
    context: args.context,
    graphForRun: args.graphForRun,
    writableNodeId: args.writableNodeId,
    registry: args.widgetRegistry,
  })
  const connectedValuesBySchemaPath = connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId)
  const connectedPromptValue = connectedValuesBySchemaPath?.['properties.prompt']
  const sourceContexts = resolveStoryboardWidgetTextSourceContexts({
    graphData: connectedValuesInput?.graphData,
    connectedValue: connectedPromptValue,
    targetPath: 'properties.prompt',
  })
  const prompts = resolveStoryboardWidgetTextGenerationPrompts({
    authoredPrompt: properties.prompt,
    connectedValue: connectedPromptValue?.value,
    sourceContexts,
  })
  return {
    properties,
    formId,
    ...prompts,
    connectedSourceNodeId: connectedPromptValue?.sources?.[0]?.nodeId || '',
    outputSourceProvenanceJson: serializeStoryboardWidgetTextSourceProvenance(sourceContexts),
  }
}
