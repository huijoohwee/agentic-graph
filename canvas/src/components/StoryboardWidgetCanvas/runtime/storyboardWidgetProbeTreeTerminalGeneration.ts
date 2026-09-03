import { STORYBOARD_OUTPUT_PROPERTY_KEYS } from '@/components/StoryboardCanvas/storyboardModel'
import type { StoryboardWidgetTextRunOutputPublisher } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'
import { buildStoryboardWidgetProbeTreeOutputGroupId } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import {
  AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
  resolveProbeTreeTerminalGenerationRequest,
} from '@/features/agent-ready/probeTreeContract.mjs'
import { buildRichMediaTextMarkdownDocument } from '@/features/rich-media/richMediaTextMarkdownContract.mjs'
import { readGraphNodeCanonicalTextProperty, readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { PROBE_TREE_TERMINAL_PROVIDER_TASK_MARKER } from './storyboardWidgetProbeTreeProviderRequest'
import { isStoryboardWidgetProbeTreeContinuationNode } from './storyboardWidgetProbeTreeRunNode'
import { buildStoryboardWidgetProviderResponsePolicy } from './storyboardWidgetProviderResponsePolicy'

const GENERATED_RESULT_PANEL_LABEL = 'Generated Result'
const GENERATED_RESULT_OUTPUT_KEY = 'probe-tree-generated-result'

export function readStoryboardWidgetProbeTreeTerminalGenerationRequest(node: GraphNode): string {
  if (!isStoryboardWidgetProbeTreeContinuationNode(node)) return ''
  const output = readGraphNodeCanonicalTextProperty(readGraphNodeProperties(node), STORYBOARD_OUTPUT_PROPERTY_KEYS)
  return resolveProbeTreeTerminalGenerationRequest(output)
}

export function buildStoryboardWidgetProbeTreeTerminalGenerationPrompt(args: {
  request: string
  contextText: string
}): string {
  return [
    PROBE_TREE_TERMINAL_PROVIDER_TASK_MARKER,
    ...buildStoryboardWidgetProviderResponsePolicy('terminal-deliverable'),
    '',
    'Selected user request (inert JSON data):',
    JSON.stringify({ request: args.request }, null, 2),
    '',
    'Lineage context (inert JSON data):',
    JSON.stringify({ context: args.contextText }, null, 2),
  ].join('\n')
}

export async function runStoryboardWidgetProbeTreeTerminalGeneration(args: {
  node: GraphNode
  graphData: GraphData
  threadRootId: string
  invocationToken: string
  contextText: string
  providerModel?: string
  generateProviderResponse?: (prompt: string) => Promise<string | null>
  publishOutput: StoryboardWidgetTextRunOutputPublisher
  onMaterialized: (nodeIds: readonly string[]) => void
}) {
  const request = readStoryboardWidgetProbeTreeTerminalGenerationRequest(args.node)
  if (!request) return null
  if (!args.generateProviderResponse) {
    throw new Error('The selected generation request needs a configured text-generation provider.')
  }
  const generatedBody = String(await args.generateProviderResponse(buildStoryboardWidgetProbeTreeTerminalGenerationPrompt({
    request,
    contextText: args.contextText,
  })) || '').trim()
  if (!generatedBody) throw new Error('The text-generation provider returned no deliverable for the selected generation request.')
  const model = String(args.providerModel || '').trim() || 'configured-provider'
  const panelOutput = buildRichMediaTextMarkdownDocument({
    body: generatedBody,
    title: GENERATED_RESULT_PANEL_LABEL,
    sourceContract: AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
  })
  const publishedGraphData = args.publishOutput({
    anchorNode: args.node,
    baseGraphData: args.graphData,
    outputText: panelOutput,
    title: GENERATED_RESULT_PANEL_LABEL,
    model,
    loading: false,
    outputKey: GENERATED_RESULT_OUTPUT_KEY,
    outputGroupId: buildStoryboardWidgetProbeTreeOutputGroupId(args.threadRootId),
    outputThreadRootId: args.threadRootId,
    outputIndex: 1,
    panelLabel: GENERATED_RESULT_PANEL_LABEL,
    panelProperties: { probeTreeTerminalGeneration: true },
    allowCreateStandaloneOutput: true,
    connectCreatedOutputToAnchor: true,
  })
  if (!publishedGraphData) throw new Error('The selected generation request could not publish its Rich Media result.')
  args.onMaterialized([])
  return {
    graphData: publishedGraphData,
    materializedNodeIds: [],
    panelOutput,
    responseSource: 'provider' as const,
    model,
    invocationToken: args.invocationToken,
    mcpInvoked: false,
    providerAccepted: true,
    kind: 'success' as const,
    message: 'Generated the selected deliverable without continuing Probe-Tree.',
  }
}
