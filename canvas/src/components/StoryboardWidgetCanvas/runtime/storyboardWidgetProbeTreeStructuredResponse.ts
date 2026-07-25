import { buildProbeTreeStoryboardMermaidFlowchart, PROBE_TREE_STORYBOARD_MERMAID_FLOWCHART_KIND } from '@/components/StoryboardCanvas/storyboardProbeTreeMermaidFlowchart'
import { hashText } from '@/features/parsers/hash'
import { extractChatResponseStructuredSurface, type ChatResponseSurfaceNode } from '@/features/chat/chatResponseStructuredContent'
import { buildRichMediaTextMarkdownDocument } from '@/features/rich-media/richMediaTextMarkdownContract.mjs'
import { KNOWGRPH_PROBE_TREE_MAX_DEPTH } from '@/features/agentic-os/probeTreePromptPreset'
import {
  KNOWGRPH_PROBE_TREE_CONTRACT_VERSION,
  PROBE_TREE_CARD_VARIANTS,
  PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
  areProbeTreeCardsMutuallyDistinct,
  isProbeTreeCardUserInputRelevant,
  normalizeProbeTreeSelectionOptions,
  resolveProbeTreeContextAnchors,
} from '@/features/agent-ready/probeTreeContract.mjs'
import type { ProbeTreeMcpInvocationResolution } from '@/features/agent-ready/probeTreeMcpBridgeContract'
import { resolveStoryboardWidgetProbeTreeBranchPositions } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'

const GENERIC_PROBE_CARD_PATTERN = /^(?:clarify probe|generate branches|select handoff)(?::|$)/i

const readString = (value: unknown): string => String(unwrapGraphCellValue(value) ?? '').trim()

const readNodeId = (node?: GraphNode | null): string => readString(node?.id)

export const resolveUniqueProbeTreeCardNodeId = (args: {
  candidateId: string
  anchorNodeId: string
  candidateKey: string
  index: number
  occupiedNodeIds: Set<string>
}): string => {
  const baseId = readString(args.candidateId) || `mcp-response-card-${args.index + 1}`
  if (!args.occupiedNodeIds.has(baseId)) {
    args.occupiedNodeIds.add(baseId)
    return baseId
  }
  const scope = hashText(`${args.anchorNodeId}:${args.candidateKey}:${args.index}`).slice(0, 8)
  let nodeId = `${baseId}-${scope}`
  let suffix = 2
  while (args.occupiedNodeIds.has(nodeId)) {
    nodeId = `${baseId}-${scope}-${suffix}`
    suffix += 1
  }
  args.occupiedNodeIds.add(nodeId)
  return nodeId
}

const readProbeTreeDepth = (properties: Record<string, unknown>): number => {
  const value = Number(unwrapGraphCellValue(properties.probeTreeDepth))
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(KNOWGRPH_PROBE_TREE_MAX_DEPTH, Math.floor(value)))
}

const isProbeTreeCardForAnchor = (node: GraphNode, anchorNodeId: string): boolean => {
  const properties = readGraphNodeProperties(node)
  const parentNodeId = readString(properties.parentNodeId || properties.parentGraphNodeId)
  return parentNodeId === anchorNodeId && readString(properties.cardTypeLabel) === 'Probe-Tree Card'
}

const collectReplacedProbeTreeNodeIds = (graphData: GraphData, anchorNodeId: string): Set<string> => {
  const removedNodeIds = new Set(
    (graphData.nodes || [])
      .filter(node => isProbeTreeCardForAnchor(node, anchorNodeId))
      .map(readNodeId)
      .filter(Boolean),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const node of graphData.nodes || []) {
      const nodeId = readNodeId(node)
      if (!nodeId || removedNodeIds.has(nodeId)) continue
      const properties = readGraphNodeProperties(node)
      const parentNodeId = readString(properties.parentNodeId || properties.parentGraphNodeId)
      if (!removedNodeIds.has(parentNodeId) || readString(properties.cardTypeLabel) !== 'Probe-Tree Card') continue
      removedNodeIds.add(nodeId)
      changed = true
    }
  }
  return removedNodeIds
}

const isStructuredProbeCard = (node: ChatResponseSurfaceNode): boolean => (
  node.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID
  && node.properties.probeTreeResponseMode === 'llm-contract'
  && node.properties.cardTypeLabel === 'Probe-Tree Card'
  && node.properties.probeTreeCardVariant === PROBE_TREE_CARD_VARIANTS.boundedMultiSelect
  && node.properties.selectionMode === 'multiple'
  && normalizeProbeTreeSelectionOptions(node.properties.selectionOptions).length >= 2
  && node.properties.allowOther === true
  && !GENERIC_PROBE_CARD_PATTERN.test(String(node.label || '').trim())
)

const selectLargestDistinctProbeCardSet = (cards: ChatResponseSurfaceNode[]): ChatResponseSurfaceNode[] => {
  let selected: ChatResponseSurfaceNode[] = []
  const combinationCount = 1 << cards.length
  for (let mask = 1; mask < combinationCount; mask += 1) {
    const candidate = cards.filter((_, index) => (mask & (1 << index)) !== 0)
    if (candidate.length <= selected.length) continue
    if (!areProbeTreeCardsMutuallyDistinct(candidate.map(card => ({
      question: card.properties.question || card.properties.summary || card.label,
      selectionOptions: card.properties.selectionOptions,
    })))) continue
    selected = candidate
  }
  return selected
}

const buildCandidateEdge = (source: string, target: string, candidateOptionId: string): GraphEdge => ({
  id: `probe-tree:edge:${hashText(`${source}:candidateOption:${target}`).slice(0, 12)}`,
  source,
  target,
  label: 'candidateOption',
  properties: {
    evidenceKind: 'mcp-structured-response',
    confidence: 'medium',
    candidateOptionId,
  },
})

const buildPanelMarkdown = (args: {
  anchorNodeId: string
  cards: ChatResponseSurfaceNode[]
  invocationTokens: readonly string[]
  invocationResolutions: readonly ProbeTreeMcpInvocationResolution[]
  mcpInvoked: boolean
  responseSource: 'provider' | 'mcp'
  model: string
}): string => {
  const resolutionByToken = new Map(args.invocationResolutions.map(item => [item.token.toLowerCase(), item]))
  const grammarLine = args.invocationTokens.length > 0
    ? args.invocationTokens.map(token => {
        const resolved = resolutionByToken.get(token.toLowerCase())
        if (!resolved) return token
        return `${token}[resolved=${resolved.ok}]`
      }).join(' ')
    : '∅'
  const body = [
    '# Probe-Tree Branches',
    '',
    `\`source=${args.anchorNodeId} · contract=${PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION} · mcp=${args.mcpInvoked ? 'knowgrph.probe.generate' : 'none'} · response=${args.responseSource} · model=${args.model || 'unknown'}\``,
    `\`grammar=${grammarLine}\``,
    '',
    ...args.cards.flatMap((card, index) => {
      const question = readString(card.properties.summary || card.properties.question) || card.label
      const rationale = readString(card.properties.rationale)
      const evidence = readString(card.properties.evidenceNeeded)
      const selectionOptions = normalizeProbeTreeSelectionOptions(card.properties.selectionOptions)
      return [
        `${index + 1}. **${question}**`,
        ...selectionOptions.map((option, optionIndex) => `   ${optionIndex + 1}. ${option.label}`),
        ...(rationale ? [`   _${rationale}_`] : []),
        ...(evidence ? [`   > ${evidence}`] : []),
      ]
    }),
  ].join('\n')
  return buildRichMediaTextMarkdownDocument({
    body,
    title: 'Probe-Tree Branches',
    sourceContract: KNOWGRPH_PROBE_TREE_CONTRACT_VERSION,
  })
}

export type StoryboardWidgetProbeTreeStructuredMaterialization = {
  graphData: GraphData
  materializedNodeIds: string[]
  panelOutput: string
  responseSource: 'provider' | 'mcp' | 'runtime'
  model: string
}

export function materializeStoryboardWidgetProbeTreeStructuredResponse(args: {
  graphData: GraphData | null | undefined
  anchorNode: GraphNode
  responseText: string
  contextText: string
  responseSource: 'provider' | 'mcp'
  model: string
  mcpInvoked: boolean
  threadRootId?: string
  invocationTokens: readonly string[]
  invocationResolutions?: readonly ProbeTreeMcpInvocationResolution[]
  onRejected?: (reason: string) => void
}): StoryboardWidgetProbeTreeStructuredMaterialization | null {
  const reject = (reason: string): null => {
    args.onRejected?.(reason)
    return null
  }
  const graphData = args.graphData
  const anchorNodeId = readNodeId(args.anchorNode)
  if (!graphData || !anchorNodeId) return reject('The graph or selected source card identity was unavailable.')
  const surface = extractChatResponseStructuredSurface(String(args.responseText || ''), {
    trustedSource: args.responseSource === 'mcp' ? 'literal-mcp' : 'assistant',
  })
  const surfaceNodes = surface?.nodes || []
  const sourceWidgets = surfaceNodes.filter(node => node.properties['chat:structuredRole'] === 'widget')
  const panels = surfaceNodes.filter(node => node.properties['chat:structuredRole'] === 'panel')
  const responseCards = surfaceNodes.filter(node => node.properties['chat:structuredRole'] === 'card')
  const sourceEnvelopeAccepted = args.responseSource === 'provider'
    ? sourceWidgets.length === 0 && panels.length === 0
    : sourceWidgets.length === 1 && panels.length === 1 && readString(panels[0]?.label) === 'Probe-Tree Branches'
  if (!sourceEnvelopeAccepted) {
    return reject('The response envelope included unsupported widgets or panels, or omitted the required MCP envelope.')
  }
  if (responseCards.length < 2 || responseCards.length > 4) {
    return reject(`The response contained ${responseCards.length} cards; exactly 2-4 are required.`)
  }
  const structuredCards = responseCards.filter(isStructuredProbeCard)
  const relevantCards = structuredCards.map(card => {
    const question = card.properties.question || card.properties.summary || card.label
    const contextAnchors = resolveProbeTreeContextAnchors({
      contextText: args.contextText,
      question,
      contextAnchors: card.properties.contextAnchors || card.properties.probeTreeUserInputAnchors,
    })
    if (!isProbeTreeCardUserInputRelevant({
      contextText: args.contextText,
      question,
      selectionOptions: card.properties.selectionOptions,
      contextAnchors,
    })) return null
    return {
      ...card,
      properties: { ...card.properties, contextAnchors, probeTreeUserInputAnchors: contextAnchors },
    }
  }).filter(card => card != null)
  const cards = selectLargestDistinctProbeCardSet(relevantCards)
  if (cards.length < 2) {
    return reject(`Only ${cards.length} of ${responseCards.length} cards remained after structure, query relevance, semantic-choice, and mutual-distinctness validation.`)
  }

  const removedNodeIds = collectReplacedProbeTreeNodeIds(graphData, anchorNodeId)
  const retainedNodes = (graphData.nodes || []).filter(node => !removedNodeIds.has(readNodeId(node)))
  const occupiedNodeIds = new Set(retainedNodes.map(readNodeId).filter(Boolean))
  const priorNodeById = new Map((graphData.nodes || []).map(node => [readNodeId(node), node]))
  const anchorProperties = readGraphNodeProperties(args.anchorNode)
  const threadRootId = readString(args.threadRootId) || readString(anchorProperties.probeTreeThreadRootId) || anchorNodeId
  const nextProbeTreeDepth = Math.min(KNOWGRPH_PROBE_TREE_MAX_DEPTH, readProbeTreeDepth(anchorProperties) + 1)
  const projectedPositions = resolveStoryboardWidgetProbeTreeBranchPositions({
    graphData,
    anchorNode: args.anchorNode,
    removedNodeIds,
    count: cards.length,
  })
  const materializedNodeIds: string[] = []
  const projectedNodes: GraphNode[] = cards.map((card, index) => {
    const candidateOptionId = readString(card.properties.probeTreeCandidateKey) || `candidate-${index + 1}`
    const nodeId = resolveUniqueProbeTreeCardNodeId({
      candidateId: card.id,
      anchorNodeId,
      candidateKey: candidateOptionId,
      index,
      occupiedNodeIds,
    })
    materializedNodeIds.push(nodeId)
    const previous = priorNodeById.get(nodeId)
    const question = readString(card.properties.summary || card.properties.question) || card.label
    return {
      id: nodeId,
      type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      label: question.slice(0, 160),
      x: typeof previous?.x === 'number' && Number.isFinite(previous.x) ? previous.x : projectedPositions[index]!.x,
      y: typeof previous?.y === 'number' && Number.isFinite(previous.y) ? previous.y : projectedPositions[index]!.y,
      properties: {
        ...card.properties,
        title: question.slice(0, 160),
        output: '',
        summary: question,
        index: `P${index + 1}`,
        parentNodeId: anchorNodeId,
        parentGraphNodeId: anchorNodeId,
        probeTreeCandidateKey: candidateOptionId,
        probeTreeResponseMode: 'llm-contract',
        probeTreeThreadRootId: threadRootId,
        probeTreeCurrentNodeId: nodeId,
        probeTreeDepth: nextProbeTreeDepth,
        responseContractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
        responseSource: args.responseSource,
        mcpInvoked: args.mcpInvoked,
        outputModel: args.model,
      } as Record<string, JSONValue>,
    }
  })

  const retainedEdges = (graphData.edges || []).filter(edge => {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    const label = readString(edge.label)
    if ((src && removedNodeIds.has(src)) || (tgt && removedNodeIds.has(tgt))) return false
    return !(src === anchorNodeId && label === 'candidateOption')
  })
  const candidateEdges = projectedNodes.map((node, index) => buildCandidateEdge(
    anchorNodeId,
    node.id,
    readString(node.properties.probeTreeCandidateKey) || `candidate-${index + 1}`,
  ))
  let nextGraphData: GraphData = {
    ...graphData,
    nodes: [...retainedNodes, ...projectedNodes],
    edges: [...retainedEdges, ...candidateEdges],
    metadata: {
      ...(graphData.metadata || {}),
      probeTreeMaterializedAtMs: Date.now(),
      probeTreeInvocation: 'knowgrph.probe.generate',
      probeTreeResponseContractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
      probeTreeMcpInvoked: args.mcpInvoked,
      probeTreeResponseSource: args.responseSource,
    },
  }
  nextGraphData = {
    ...nextGraphData,
    metadata: {
      ...(nextGraphData.metadata || {}),
      probeTreeMermaidFlowchart: buildProbeTreeStoryboardMermaidFlowchart({ graphData: nextGraphData, rootNodeId: anchorNodeId }),
      probeTreeMermaidFlowchartKind: PROBE_TREE_STORYBOARD_MERMAID_FLOWCHART_KIND,
    },
  }
  return {
    graphData: nextGraphData,
    materializedNodeIds,
    panelOutput: buildPanelMarkdown({
      anchorNodeId,
      cards,
      invocationTokens: args.invocationTokens,
      invocationResolutions: args.invocationResolutions || [],
      mcpInvoked: args.mcpInvoked,
      responseSource: args.responseSource,
      model: args.model,
    }),
    responseSource: args.responseSource,
    model: args.model,
  }
}
