import { materializeProbeTreeBranchCardsFromGraphNode, type ProbeTreeBranchCardMaterializationResult } from '@/components/StoryboardCanvas/storyboardProbeTreeInvocationAction'
import {
  STORYBOARD_ACTION_PROPERTY_KEYS,
  STORYBOARD_OUTPUT_PROPERTY_KEYS,
  STORYBOARD_PROMPT_PROPERTY_KEYS,
  STORYBOARD_SUMMARY_PROPERTY_KEYS,
} from '@/components/StoryboardCanvas/storyboardModel'
import type { StoryboardWidgetTextRunOutputPublisher } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'
import {
  materializeStoryboardWidgetProbeTreeStructuredResponse,
  type StoryboardWidgetProbeTreeStructuredMaterialization,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeStructuredResponse'
import {
  buildStoryboardWidgetProbeTreeOutputGroupId,
  normalizeStoryboardWidgetProbeTreeOutputLayout,
  PROBE_TREE_OUTPUT_KEY,
  PROBE_TREE_OUTPUT_LAYOUT_VERSION,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import {
  KNOWGRPH_PROBE_TREE_DOC_INVOCATION,
  KNOWGRPH_PROBE_TREE_INVOCATION_TOKENS,
} from '@/features/agentic-os/probeTreePromptPreset'
import {
  KNOWGRPH_PROBE_TREE_CONTRACT_VERSION,
  PROBE_TREE_DEFAULTS,
} from '@/features/agent-ready/probeTreeContract.mjs'
import { invokeProbeTreeMcpBridge } from '@/features/agent-ready/probeTreeMcpClient'
import type { ProbeTreeMcpBridgeSuccess } from '@/features/agent-ready/probeTreeMcpBridgeContract'
import { buildRichMediaTextMarkdownDocument } from '@/features/rich-media/richMediaTextMarkdownContract.mjs'
import {
  readGraphNodeCanonicalTextProperty,
  readGraphNodeCardTitle,
  readGraphNodeProperties,
} from '@/lib/cards/graphNodeCardFields'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { StoryboardWidgetRunExecutionAnchorSnapshot } from './storyboardWidgetRunExecutionAnchor'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from './storyboardWidgetRenderGraph'
import { buildStoryboardWidgetProbeTreeContextText } from './storyboardWidgetProbeTreeContext'
import { buildStoryboardWidgetProbeTreeProviderPrompt } from './storyboardWidgetProbeTreeProviderPrompt'
import { buildStoryboardWidgetProbeTreeProviderRepairPrompt } from './storyboardWidgetProbeTreeProviderRepairPrompt'
import {
  isStoryboardWidgetProbeTreeContinuationNode,
  reconcileStoryboardWidgetProbeTreeSelectedRunNode,
} from './storyboardWidgetProbeTreeRunNode'
import {
  runStoryboardWidgetProbeTreeTerminalGeneration,
} from './storyboardWidgetProbeTreeTerminalGeneration'
import {
  buildStoryboardWidgetProbeTreeProviderInvocation,
  prepareStoryboardWidgetProbeTreeTextGeneration,
  type StoryboardWidgetProbeTreeProviderRuntimeProperties,
} from './storyboardWidgetWorkflowProbeTreeTextGeneration'

export {
  resolveStoryboardWidgetProbeTreeChatRoute,
} from './storyboardWidgetWorkflowProbeTreeTextGeneration'

const INVOCATION_TOKEN_PATTERN = /(^|\s)([/#@][A-Za-z0-9_.-]+)/g
const PROBE_TREE_INVOCATION_TOKENS = new Set<string>(
  KNOWGRPH_PROBE_TREE_INVOCATION_TOKENS.map(token => token.toLowerCase()),
)
const PROBE_TREE_RICH_MEDIA_PANEL_LABEL = 'Probe-Tree Branches'
const PROBE_TREE_GRAPH_PROJECTION_MODEL = 'knowgrph-probe-tree-graph-projection'
const PROBE_TREE_PROVIDER_MAX_ATTEMPTS = 3

const readGraphIdentity = (value: unknown): string => String(unwrapGraphCellValue(value) ?? '').trim()

const readProbeTreeDepth = (properties: Record<string, unknown>): number => {
  const value = Number(unwrapGraphCellValue(properties.probeTreeDepth))
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(PROBE_TREE_DEFAULTS.maxDepth, Math.floor(value)))
}

export type StoryboardWidgetProbeTreeMaterializationResult = ProbeTreeBranchCardMaterializationResult & {
  invocationToken: string
}

export function resolveStoryboardWidgetProbeTreeInvocationToken(prompt: string): string {
  const text = String(prompt || '')
  for (const match of text.matchAll(INVOCATION_TOKEN_PATTERN)) {
    const token = String(match[2] || '')
    if (PROBE_TREE_INVOCATION_TOKENS.has(token.toLowerCase())) return token
  }
  return ''
}

const resolveStoryboardWidgetProbeTreeThreadRootId = (graphData: GraphData, node: GraphNode): string => {
  const properties = readGraphNodeProperties(node)
  const explicitRootId = readGraphIdentity(properties.probeTreeThreadRootId)
  if (explicitRootId) return explicitRootId
  const nodeById = new Map((graphData.nodes || []).map(candidate => [readGraphIdentity(candidate.id), candidate]))
  const seen = new Set<string>([readGraphIdentity(node.id)])
  let parentNodeId = readGraphIdentity(properties.parentNodeId || properties.parentGraphNodeId)
  let rootNodeId = parentNodeId || readGraphIdentity(node.id)
  while (parentNodeId && !seen.has(parentNodeId) && seen.size <= PROBE_TREE_DEFAULTS.maxDepth) {
    seen.add(parentNodeId)
    rootNodeId = parentNodeId
    const parentNode = nodeById.get(parentNodeId)
    if (!parentNode) break
    const parentProperties = readGraphNodeProperties(parentNode)
    const parentExplicitRootId = readGraphIdentity(parentProperties.probeTreeThreadRootId)
    if (parentExplicitRootId) return parentExplicitRootId
    parentNodeId = readGraphIdentity(parentProperties.parentNodeId || parentProperties.parentGraphNodeId)
  }
  return rootNodeId
}

export function resolveStoryboardWidgetProbeTreeInvocationTokenForNode(node: GraphNode, invocationText: string): string {
  return resolveStoryboardWidgetProbeTreeInvocationToken(invocationText)
    || (isStoryboardWidgetProbeTreeContinuationNode(node) ? KNOWGRPH_PROBE_TREE_DOC_INVOCATION.slashCommand : '')
}

export function readStoryboardWidgetProbeTreeInvocationText(node: GraphNode): string {
  const properties = readGraphNodeProperties(node)
  const prompt = readGraphNodeCanonicalTextProperty(properties, STORYBOARD_PROMPT_PROPERTY_KEYS)
  const summary = readGraphNodeCanonicalTextProperty(properties, STORYBOARD_SUMMARY_PROPERTY_KEYS)
  const output = readGraphNodeCanonicalTextProperty(properties, STORYBOARD_OUTPUT_PROPERTY_KEYS)
  const action = readGraphNodeCanonicalTextProperty(properties, STORYBOARD_ACTION_PROPERTY_KEYS)
  return (isStoryboardWidgetProbeTreeContinuationNode(node) && output
    ? [output, summary, prompt, action]
    : [prompt, summary, output, action]
  ).filter(Boolean).join('\n')
}

export function buildStoryboardWidgetProbeTreeRichMediaMarkdown(
  materialized: StoryboardWidgetProbeTreeMaterializationResult,
): string {
  const graphNodes = materialized.graphData?.nodes || []
  const branches = materialized.materializedNodeIds
    .map(nodeId => graphNodes.find(node => String(node?.id || '') === nodeId))
    .filter((node): node is GraphNode => Boolean(node))
  const branchLines = branches.map((node, index) => {
    const properties = readGraphNodeProperties(node)
    const summary = readGraphNodeCanonicalTextProperty(properties, ['summary', 'action'])
    return `${index + 1}. **${readGraphNodeCardTitle(node)}**${summary ? ` — ${summary}` : ''}`
  })
  const body = [
    '# Probe-Tree Branches',
    '',
    `Invocation: ${KNOWGRPH_PROBE_TREE_INVOCATION_TOKENS.join(' ')}`,
    `Source: ${KNOWGRPH_PROBE_TREE_DOC_INVOCATION.sourcePath}`,
    'Mode: deterministic local fallback; select or edit a branch card before the next bounded turn.',
    'Cost: 0 prompt tokens, 0 completion tokens, $0 estimated cost.',
    '',
    ...(branchLines.length > 0 ? branchLines : [`- ${materialized.message}`]),
  ].join('\n')
  return buildRichMediaTextMarkdownDocument({
    body,
    title: PROBE_TREE_RICH_MEDIA_PANEL_LABEL,
    sourceContract: KNOWGRPH_PROBE_TREE_CONTRACT_VERSION,
  })
}

export function materializeStoryboardWidgetProbeTreeInvocation(args: {
  prompt: string
  graphData: GraphData | null | undefined
  node?: GraphNode | null
}): StoryboardWidgetProbeTreeMaterializationResult | null {
  const invocationToken = resolveStoryboardWidgetProbeTreeInvocationToken(args.prompt)
  if (!invocationToken) return null
  return {
    ...materializeProbeTreeBranchCardsFromGraphNode({
      graphData: args.graphData,
      node: args.node,
    }),
    invocationToken,
  }
}

export function runStoryboardWidgetProbeTreeInvocation(args: {
  graphForRun: GraphData | null | undefined
  nodeIds: readonly string[]
  fallbackNode: GraphNode
  onMaterialized: (nodeIds: readonly string[]) => void
  publishOutput: StoryboardWidgetTextRunOutputPublisher
}): StoryboardWidgetProbeTreeMaterializationResult | null {
  const current = args.graphForRun
  if (!current) return null
  const nodeIds = new Set(args.nodeIds.map(id => String(id || '')).filter(Boolean))
  const node = current.nodes.find(candidate => nodeIds.has(String(candidate?.id || ''))) || args.fallbackNode
  const prompt = readStoryboardWidgetProbeTreeInvocationText(args.fallbackNode)
  const materialized = materializeStoryboardWidgetProbeTreeInvocation({ prompt, graphData: current, node })
  if (!materialized) return null
  if (materialized.materializedNodeIds.length === 0) return materialized
  const threadRootId = resolveStoryboardWidgetProbeTreeThreadRootId(current, node)
  const outputGroupId = buildStoryboardWidgetProbeTreeOutputGroupId(threadRootId)
  const panelOutput = buildStoryboardWidgetProbeTreeRichMediaMarkdown(materialized)
  const graphData = normalizeStoryboardWidgetProbeTreeOutputLayout({ graphData: materialized.graphData, threadRootId })
  const publishedGraphData = args.publishOutput({
    anchorNode: node,
    baseGraphData: graphData || current,
    outputText: panelOutput,
    title: PROBE_TREE_RICH_MEDIA_PANEL_LABEL,
    model: PROBE_TREE_GRAPH_PROJECTION_MODEL,
    loading: false,
    outputKey: PROBE_TREE_OUTPUT_KEY,
    outputGroupId,
    outputThreadRootId: threadRootId,
    outputIndex: 1,
    panelLabel: PROBE_TREE_RICH_MEDIA_PANEL_LABEL,
    panelProperties: {
      probeTreeThreadLedger: true,
      probeTreeOutputLayoutVersion: PROBE_TREE_OUTPUT_LAYOUT_VERSION,
      markdownWorkspaceViewerSurface: true,
    },
    materializationChildNodeIds: materialized.materializedNodeIds,
    connectCreatedOutputToAnchor: true,
  })
  if (!publishedGraphData) throw new Error('Probe-Tree could not publish its Rich Media ledger.')
  if (materialized.materializedNodeIds.length > 0) args.onMaterialized(materialized.materializedNodeIds)
  return { ...materialized, graphData: publishedGraphData }
}

const collectInvocationTokens = (value: string): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of String(value || '').matchAll(INVOCATION_TOKEN_PATTERN)) {
    const token = String(match[2] || '').trim()
    const key = token.toLowerCase()
    if (!token || seen.has(key)) continue
    seen.add(key)
    out.push(token)
    if (out.length >= 24) break
  }
  return out
}

const readMcpModel = (result: Record<string, unknown>): string => {
  const structured = result.structuredContent && typeof result.structuredContent === 'object'
    ? result.structuredContent as Record<string, unknown>
    : {}
  const costLog = structured.cost_log && typeof structured.cost_log === 'object'
    ? structured.cost_log as Record<string, unknown>
    : {}
  return String(costLog.model || '').trim() || 'knowgrph.probe.generate'
}

export type StoryboardWidgetProbeTreeMcpRunResult = StoryboardWidgetProbeTreeStructuredMaterialization & {
  invocationToken: string
  mcpInvoked: boolean
  providerAccepted: boolean
  providerAttempts?: number
  kind: 'success' | 'warning'
  message: string
  mcpError?: string
  providerError?: string
}

export async function runStoryboardWidgetProbeTreeMcpInvocation(args: {
  graphForRun: GraphData | null | undefined
  nodeIds: readonly string[]
  fallbackNode: GraphNode
  onMaterialized: (nodeIds: readonly string[]) => void
  publishOutput: StoryboardWidgetTextRunOutputPublisher
  providerModel?: string
  generateProviderResponse?: (prompt: string) => Promise<string | null>
  invokeMcp?: typeof invokeProbeTreeMcpBridge
  executionAnchor?: StoryboardWidgetRunExecutionAnchorSnapshot | null
}): Promise<StoryboardWidgetProbeTreeMcpRunResult | null> {
  const current = args.graphForRun
  if (!current) return null
  const nodeIds = new Set(args.nodeIds.map(id => String(id || '').trim()).filter(Boolean))
  const fallbackNodeId = readGraphIdentity(args.fallbackNode.id)
  const currentFallbackNode = current.nodes.find(candidate => readGraphIdentity(candidate?.id) === fallbackNodeId)
  const selectedContinuationNode = isStoryboardWidgetProbeTreeContinuationNode(args.fallbackNode)
    ? args.fallbackNode
    : null
  const node = selectedContinuationNode
    || currentFallbackNode
    || current.nodes.find(candidate => nodeIds.has(readGraphIdentity(candidate?.id)))
    || args.fallbackNode
  const prompt = readStoryboardWidgetProbeTreeInvocationText(args.fallbackNode)
  const invocationToken = resolveStoryboardWidgetProbeTreeInvocationTokenForNode(node, prompt)
  if (!invocationToken) return null

  const currentNodeId = readGraphIdentity(node.id) || readGraphIdentity(args.fallbackNode.id)
  const graphForInvocation = reconcileStoryboardWidgetProbeTreeSelectedRunNode({
    graphData: current,
    selectedNode: node,
  })
  const properties = readGraphNodeProperties(node)
  const threadRootId = resolveStoryboardWidgetProbeTreeThreadRootId(graphForInvocation, node)
  const contextText = buildStoryboardWidgetProbeTreeContextText({
    graphData: graphForInvocation,
    node,
    prompt,
  })
  const terminalGeneration = await runStoryboardWidgetProbeTreeTerminalGeneration({
    node,
    graphData: graphForInvocation,
    threadRootId,
    invocationToken,
    contextText,
    providerModel: args.providerModel,
    generateProviderResponse: args.generateProviderResponse,
    publishOutput: args.publishOutput,
    onMaterialized: args.onMaterialized,
  })
  if (terminalGeneration) return terminalGeneration
  const currentProbeTreeDepth = readProbeTreeDepth(properties)
  if (currentProbeTreeDepth >= PROBE_TREE_DEFAULTS.maxDepth) {
    return {
      graphData: graphForInvocation,
      materializedNodeIds: [],
      panelOutput: '',
      responseSource: 'runtime',
      model: 'none',
      invocationToken,
      mcpInvoked: false,
      providerAccepted: false,
      kind: 'warning',
      message: `Probe-Tree stopped at the ${PROBE_TREE_DEFAULTS.maxDepth}-branch depth limit.`,
    }
  }
  const nextProbeTreeDepth = currentProbeTreeDepth + 1
  const invocationTokens = collectInvocationTokens(prompt)
  let bridge: ProbeTreeMcpBridgeSuccess | null = null
  let mcpError = ''
  try {
    bridge = await (args.invokeMcp || invokeProbeTreeMcpBridge)({
      threadRootId,
      currentNodeId,
      contextText,
      invocationTokens,
      optionCount: 3,
      probeTreeDepth: nextProbeTreeDepth,
      recallTopK: isStoryboardWidgetProbeTreeContinuationNode(node) ? 0 : PROBE_TREE_DEFAULTS.recallTopK,
      tokenBudget: 1200,
    })
  } catch (error) {
    mcpError = error instanceof Error ? error.message : String(error || '')
  }

  const mcpResult = bridge?.result || {
    isError: true,
    content: [],
    structuredContent: {
      contractVersion: KNOWGRPH_PROBE_TREE_CONTRACT_VERSION,
      ok: false,
      degraded: true,
      degraded_reason: mcpError || 'mcp_unavailable',
    },
  }
  const mcpInvoked = bridge?.mcpInvoked === true
  let providerText = ''
  let providerError = ''
  let providerAttempts = 0
  const providerPrompt = buildStoryboardWidgetProbeTreeProviderPrompt({
    contextText,
    currentNodeId,
    mcpResult,
    mcpInvoked,
    probeTreeDepth: nextProbeTreeDepth,
  })
  if (args.generateProviderResponse) {
    try {
      providerAttempts += 1
      providerText = String(await args.generateProviderResponse(providerPrompt) || '').trim()
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error || '')
    }
  }

  let providerAccepted = false
  let providerRejectionReason = providerText ? '' : 'The provider returned an empty response.'
  let materialized = providerText
    ? materializeStoryboardWidgetProbeTreeStructuredResponse({
        graphData: graphForInvocation,
        anchorNode: node,
        responseText: providerText,
        contextText,
        responseSource: 'provider',
        model: String(args.providerModel || '').trim() || 'configured-provider',
        mcpInvoked,
        threadRootId,
        invocationTokens,
        invocationResolutions: bridge?.invocationResolutions,
        executionAnchor: args.executionAnchor,
        onRejected: reason => { providerRejectionReason = reason },
      })
    : null
  if (materialized) providerAccepted = true

  const mcpModel = readMcpModel(mcpResult)
  if (!materialized && mcpInvoked && mcpModel.toLowerCase() !== 'none') {
    materialized = materializeStoryboardWidgetProbeTreeStructuredResponse({
      graphData: graphForInvocation,
      anchorNode: node,
      responseText: JSON.stringify({ jsonrpc: '2.0', id: `probe-tree-${currentNodeId}`, result: mcpResult }, null, 2),
      contextText,
      responseSource: 'mcp',
      model: mcpModel,
      mcpInvoked,
      threadRootId,
      invocationTokens,
      invocationResolutions: bridge?.invocationResolutions,
      executionAnchor: args.executionAnchor,
    })
  }
  while (!materialized && args.generateProviderResponse && !providerError && providerAttempts < PROBE_TREE_PROVIDER_MAX_ATTEMPTS) {
    const repairAttempt = providerAttempts
    let repairText = ''
    try {
      providerAttempts += 1
      repairText = String(await args.generateProviderResponse(buildStoryboardWidgetProbeTreeProviderRepairPrompt({
        basePrompt: providerPrompt,
        rejectionReason: providerRejectionReason,
        repairAttempt,
        maxRepairAttempts: PROBE_TREE_PROVIDER_MAX_ATTEMPTS - 1,
      })) || '').trim()
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error || '')
    }
    if (repairText) {
      materialized = materializeStoryboardWidgetProbeTreeStructuredResponse({
        graphData: graphForInvocation,
        anchorNode: node,
        responseText: repairText,
        contextText,
        responseSource: 'provider',
        model: String(args.providerModel || '').trim() || 'configured-provider',
        mcpInvoked,
        threadRootId,
        invocationTokens,
        invocationResolutions: bridge?.invocationResolutions,
        executionAnchor: args.executionAnchor,
        onRejected: reason => { providerRejectionReason = reason },
      })
      if (materialized) providerAccepted = true
    } else {
      providerRejectionReason = 'The provider returned an empty repair response.'
    }
  }
  if (!materialized) {
    if (providerError) throw new Error(`Probe-Tree LLM request failed: ${providerError}`)
    throw new Error('Probe-Tree received no accepted 2-4 query-specific LLM cards. Check the configured chat model and ensure its questions introduce missing decision variables instead of restating the source query; the zero-model MCP path does not synthesize fallback cards.')
  }

  const outputGroupId = buildStoryboardWidgetProbeTreeOutputGroupId(threadRootId)
  const normalizedGraphData = normalizeStoryboardWidgetProbeTreeOutputLayout({
    graphData: materialized.graphData,
    threadRootId,
  })
  materialized = { ...materialized, graphData: normalizedGraphData }
  const publishedGraphData = args.publishOutput({
    anchorNode: node,
    baseGraphData: normalizedGraphData,
    outputText: materialized.panelOutput,
    title: PROBE_TREE_RICH_MEDIA_PANEL_LABEL,
    model: materialized.model,
    loading: false,
    outputKey: PROBE_TREE_OUTPUT_KEY,
    outputGroupId,
    outputThreadRootId: threadRootId,
    outputIndex: 1,
    outputCount: 1,
    materializationPosition: materialized.outputPanelPosition,
    panelLabel: PROBE_TREE_RICH_MEDIA_PANEL_LABEL,
    panelProperties: {
      probeTreeThreadLedger: true,
      probeTreeOutputLayoutVersion: PROBE_TREE_OUTPUT_LAYOUT_VERSION,
      markdownWorkspaceViewerSurface: true,
    },
    materializationChildNodeIds: materialized.materializedNodeIds,
    connectCreatedOutputToAnchor: true,
  })
  if (!publishedGraphData) throw new Error('Probe-Tree could not publish its Rich Media ledger.')
  materialized = { ...materialized, graphData: publishedGraphData }
  args.onMaterialized(materialized.materializedNodeIds)
  const count = materialized.materializedNodeIds.length
  return {
    ...materialized,
    invocationToken,
    mcpInvoked,
    providerAccepted,
    providerAttempts,
    kind: 'success',
    message: mcpInvoked
      ? `Generated ${count} context-specific Probe-Tree card${count === 1 ? '' : 's'} through knowgrph MCP.`
      : `Generated ${count} context-specific Probe-Tree card${count === 1 ? '' : 's'} through the explicitly approved provider; knowgrph MCP was unavailable.`,
    ...(mcpError ? { mcpError } : {}),
    ...(providerError ? { providerError } : {}),
  }
}

export async function runStoryboardWidgetProbeTreeTextGenerationInvocation(args: {
  graphForRun: GraphData | null | undefined
  nodeIds: readonly string[]
  requestedNodeId?: string
  fallbackNode: GraphNode
  resolutionContext?: StoryboardWidgetWorkflowNodeResolutionContext
  textGeneration: {
    prompt: string
    formId: unknown
    localProperties: Record<string, unknown>
    resolvedProperties: Record<string, unknown>
    runtimeProperties: StoryboardWidgetProbeTreeProviderRuntimeProperties
  }
  onMaterialized: (nodeIds: readonly string[]) => void
  onInvocationStart?: () => void
  publishOutput: StoryboardWidgetTextRunOutputPublisher
  setLoading: (loading: boolean) => void
  invokeMcp?: typeof invokeProbeTreeMcpBridge
  generateProviderResponse?: (prompt: string) => Promise<string | null>
  executionAnchor?: StoryboardWidgetRunExecutionAnchorSnapshot | null
}): Promise<StoryboardWidgetProbeTreeMcpRunResult | null> {
  const preparedInvocation = prepareStoryboardWidgetProbeTreeTextGeneration({
    ...args,
    readInvocationText: readStoryboardWidgetProbeTreeInvocationText,
    resolveInvocationTokenForNode: resolveStoryboardWidgetProbeTreeInvocationTokenForNode,
  })
  if (!preparedInvocation) return null
  args.onInvocationStart?.()
  args.setLoading(true)
  const providerInvocation = buildStoryboardWidgetProbeTreeProviderInvocation({
    invocationText: preparedInvocation.invocationText,
    textGeneration: args.textGeneration,
  })
  const generateProviderResponse = args.generateProviderResponse || providerInvocation.generateProviderResponse
  let publicationCompleted = false
  try {
    const result = await runStoryboardWidgetProbeTreeMcpInvocation({
      graphForRun: args.graphForRun,
      nodeIds: args.nodeIds,
      fallbackNode: preparedInvocation.fallbackNode,
      onMaterialized: args.onMaterialized,
      publishOutput: args.publishOutput,
      providerModel: providerInvocation.chatModel,
      invokeMcp: args.invokeMcp,
      generateProviderResponse,
      executionAnchor: args.executionAnchor,
    })
    if (!result) throw new Error('Probe-Tree did not recognize the Widget Card invocation.')
    publicationCompleted = true
    return result
  } finally {
    if (!publicationCompleted) args.setLoading(false)
  }
}
