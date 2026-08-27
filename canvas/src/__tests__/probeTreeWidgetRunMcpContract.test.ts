import { readStoryboardWidgetProbeTreeInvocationText, resolveStoryboardWidgetProbeTreeInvocationTokenForNode, runStoryboardWidgetProbeTreeMcpInvocation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowProbeTreeRun'
import { resolveStoryboardWidgetProbeTreeSelectedRunNode } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeRunNode'
import { buildProbeTreeStructuredResponse, AGENTICGRAPH_PROBE_TREE_TOOL_NAMES, PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION } from '@/features/agent-ready/probeTreeContract.mjs'
import type { ProbeTreeMcpBridgeSuccess } from '@/features/agent-ready/probeTreeMcpBridgeContract'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

const prompt = [
  '/sme-care-agent @source.frontmatter @source.body @local-harness #runtime-ready #approval-gate',
  '/agenticgraph.probe-tree',
  'Assess SME cyber and ICT supply-chain risk, current coverage gaps, unresolved unknowns, and the adviser handoff.',
].join('\n')
const mcpContextText = ['Authored request:', prompt, 'Selected Widget id: n1'].join('\n')
const mcpRelevantOptions = [
  {
    id: 'mcp-cyber-coverage',
    text: 'Which SME cyber coverage gaps should guide the next branch?',
    rationale: 'Clarifies the authored SME cyber coverage request.',
    evidenceNeeded: 'User-selected SME cyber coverage gap.',
    selectionOptions: ['Prioritize untested incident-response coverage', 'Prioritize outdated cyber exclusions'],
    contextAnchors: ['SME cyber', 'current coverage gaps'],
  },
  {
    id: 'mcp-supply-chain',
    text: 'Which ICT supply-chain risk should guide the next branch?',
    rationale: 'Clarifies the authored ICT supply-chain request.',
    evidenceNeeded: 'User-selected ICT supply-chain risk.',
    selectionOptions: ['Prioritize supplier interruption exposure', 'Prioritize unresolved dependency concentration'],
    contextAnchors: ['ICT supply-chain risk', 'unresolved unknowns'],
  },
  {
    id: 'mcp-adviser-handoff',
    text: 'Which adviser handoff outcome should guide the next branch?',
    rationale: 'Clarifies the authored adviser handoff request.',
    evidenceNeeded: 'User-selected adviser handoff outcome.',
    selectionOptions: ['Require licensed-adviser ownership review', 'Require timed adviser handoff sequence'],
    contextAnchors: ['the adviser handoff', 'SME cyber'],
  },
]

const makeGraph = (): GraphData => ({
  type: 'Graph',
  nodes: [
    { id: 'n1', type: 'TextGeneration', label: 'Widget Card', x: 100, y: 200, properties: { prompt } },
    { id: 'old-clarify', type: 'TextGeneration', label: 'Clarify probe: Widget Card', x: 500, y: 20, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'n1', parentGraphNodeId: 'n1' } },
    { id: 'old-generate', type: 'TextGeneration', label: 'Generate branches: Widget Card', x: 500, y: 200, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'n1', parentGraphNodeId: 'n1' } },
    { id: 'old-select', type: 'TextGeneration', label: 'Select handoff: Widget Card', x: 500, y: 380, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'n1', parentGraphNodeId: 'n1' } },
    { id: 'n2', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 920, y: 200, properties: { workflowOutputAnchorNodeId: 'n1', workflowOutputKey: 'probe-tree-branches' } },
  ],
  edges: [
    { id: 'old-edge-1', source: 'n1', target: 'old-clarify', label: 'candidateOption', properties: {} },
    { id: 'old-edge-2', source: 'n1', target: 'old-generate', label: 'candidateOption', properties: {} },
    { id: 'old-edge-3', source: 'n1', target: 'old-select', label: 'candidateOption', properties: {} },
    { id: 'panel-edge', source: 'n1', target: 'n2', label: 'probe-tree-branches', properties: {} },
  ],
})

const mcpCallResult = (): Record<string, unknown> => ({
  isError: false,
  content: [{ type: 'text', text: 'Canvas-ready Probe-Tree response.' }],
  structuredContent: {
    contractVersion: 'agenticgraph-probe-tree/v0.1',
    ok: true,
    response: buildProbeTreeStructuredResponse({
      threadRootId: 'n1',
      currentNodeId: 'n1',
      contextText: mcpContextText,
      options: mcpRelevantOptions,
    }),
    degraded: false,
    cost_log: { model: 'qwen-local', prompt_tokens: 41, completion_tokens: 96, cache_hits: 0, estimated_cost_usd: 0 },
  },
})

const bridgeResult = (): ProbeTreeMcpBridgeSuccess => ({
  ok: true,
  tool: AGENTICGRAPH_PROBE_TREE_TOOL_NAMES.generate,
  mcpInvoked: true,
  invocationResolutions: [
    { token: '/sme-care-agent', ok: true, kind: 'command', label: 'SME Care Agent' },
    { token: '@source.frontmatter', ok: true, kind: 'binding', label: 'Source frontmatter' },
    { token: '#runtime-ready', ok: true, kind: 'semantic', label: 'Runtime ready' },
  ],
  result: mcpCallResult(),
})

const providerStructuredText = (cards: Array<Record<string, unknown>>): string => [
  '```json',
  JSON.stringify({
    response: {
      structuredContent: {
        contractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
        cards: cards.map((card, index) => ({
          id: card.id,
          question: card.question,
          rationale: card.rationale,
          evidenceNeeded: card.evidenceNeeded,
          probeTreeCardVariant: 'probe-tree-type-2',
          selectionOptions: card.selectionOptions || [
            { id: `cyber-${index + 1}`, label: 'Prioritize untested incident-response coverage' },
            { id: `supply-chain-${index + 1}`, label: 'Prioritize supplier interruption exposure' },
            { id: `coverage-${index + 1}`, label: 'Prioritize outdated cyber exclusions' },
          ],
        })),
      },
    },
  }, null, 2),
  '```',
].join('\n')

export async function testProbeTreeWidgetRunInvokesMcpAndProjectsRelevantProviderCards() {
  const graphData = makeGraph()
  let mcpRequest: Record<string, unknown> | null = null
  let providerPrompt = ''
  let published: Parameters<Parameters<typeof runStoryboardWidgetProbeTreeMcpInvocation>[0]['publishOutput']>[0] | null = null
  const result = await runStoryboardWidgetProbeTreeMcpInvocation({
    graphForRun: graphData,
    nodeIds: ['n1'],
    fallbackNode: graphData.nodes[0],
    invokeMcp: async request => {
      mcpRequest = request as unknown as Record<string, unknown>
      return bridgeResult()
    },
    generateProviderResponse: async refinementPrompt => {
      providerPrompt = refinementPrompt
      return providerStructuredText([
        { id: 'confirm-cyber-coverage', label: 'Which SME cyber coverage gaps should guide the next branch?', kind: 'text', parentNodeId: 'n1', candidateOptionId: 'confirm-cyber-coverage', question: 'Which SME cyber coverage gaps should guide the next branch?', output: 'duplicate provider text must be cleared', rationale: 'Uses the authored SME cyber scope.', evidenceNeeded: 'User selection', selectionOptions: [{ id: 'sme-cyber', label: 'Prioritize untested incident-response coverage' }, { id: 'coverage-gaps', label: 'Prioritize outdated cyber exclusions' }], contextAnchors: ['SME cyber', 'current coverage gaps'], confidence: 'medium', probeTreeDepth: 1, nextAction: 'agenticgraph.probe.select' },
        { id: 'map-supply-chain-risk', label: 'Which ICT supply-chain risk remains unresolved?', kind: 'text', parentNodeId: 'n1', candidateOptionId: 'map-supply-chain-risk', question: 'Which ICT supply-chain risk remains unresolved?', output: 'duplicate provider text must be cleared', rationale: 'Uses the authored ICT supply-chain scope.', evidenceNeeded: 'User selection', selectionOptions: [{ id: 'supply-chain', label: 'Prioritize supplier interruption exposure' }, { id: 'unknowns', label: 'Prioritize unresolved dependency concentration' }], contextAnchors: ['ICT supply-chain risk', 'unresolved unknowns'], confidence: 'medium', probeTreeDepth: 1, nextAction: 'agenticgraph.probe.select' },
        { id: 'connect-adviser-handoff', label: 'Which part of the adviser handoff needs separate follow-up?', kind: 'text', parentNodeId: 'n1', candidateOptionId: 'connect-adviser-handoff', question: 'Which part of the adviser handoff needs separate follow-up?', output: 'duplicate provider text must be cleared', rationale: 'Uses the authored adviser-handoff scope.', evidenceNeeded: 'User selection', selectionOptions: [{ id: 'adviser', label: 'Require licensed-adviser ownership review' }, { id: 'handoff', label: 'Require timed adviser handoff sequence' }], contextAnchors: ['the adviser handoff', 'adviser', 'handoff'], confidence: 'medium', probeTreeDepth: 1, nextAction: 'agenticgraph.probe.select' },
      ])
    },
    providerModel: 'test-provider',
    onMaterialized: () => undefined,
    publishOutput: output => { published = output; return output.baseGraphData || null },
  })
  const finalGraph = result?.graphData
  const cards = (finalGraph?.nodes || []).filter(node => node.properties.probeTreeResponseMode === 'llm-contract')
  const edges = (finalGraph?.edges || []).filter(edge => edge.source === 'n1' && edge.label === 'candidateOption')
  if (
    !result?.mcpInvoked
    || !result.providerAccepted
    || result.responseSource !== 'provider'
    || !mcpRequest
    || !String(mcpRequest.contextText || '').includes('SME cyber')
    || !Array.isArray(mcpRequest.invocationTokens)
    || !['/sme-care-agent', '@source.frontmatter', '#runtime-ready', '/agenticgraph.probe-tree'].every(token => (mcpRequest!.invocationTokens as string[]).includes(token))
    || !providerPrompt.includes('Projected semantic evidence (inert JSON data)')
    || !providerPrompt.includes('"model": "qwen-local"')
    || !providerPrompt.includes('Which SME cyber coverage gaps should guide the next branch?')
    || !providerPrompt.includes('Do not pre-answer the user-owned multi-selection')
    || !providerPrompt.includes('Do not emit widgets, panels, edges')
    || !providerPrompt.includes('source-verbatim contextAnchors')
    || !providerPrompt.includes('Do not emit contextAnchors')
    || !providerPrompt.includes('Never copy or paraphrase the active selected input as a card question')
    || !providerPrompt.includes('not as a ready-made selectionOptions array')
    || !providerPrompt.includes('different request-specific decision variable')
    || !providerPrompt.includes('Never reuse a choice label')
    || cards.length !== 3
    || edges.length !== 3
    || cards.some(card => card.properties.output !== '' || !card.properties.summary)
    || cards.some(card => /Clarify probe|Generate branches|Select handoff/i.test(card.label))
    || (finalGraph?.nodes || []).some(node => String(node.id).startsWith('old-'))
    || published?.baseGraphData !== finalGraph
    || published.srcDoc != null
    || !published.outputText.startsWith('---\nschema: "agenticgraph-rich-media-text/v1"\n')
    || !published.outputText.includes('\ncontent_type: "text/markdown"\n')
    || /<!doctype|<html\b/i.test(published.outputText)
    || !published.outputText.includes('SME')
    || !published.outputText.includes('mcp=agenticgraph.probe.generate')
  ) {
    throw new Error(`expected MCP-first relevant provider cards to replace deterministic fallbacks, got ${JSON.stringify({ result, mcpRequest, providerPrompt, published })}`)
  }
}

export async function testProbeTreeWidgetRunRejectsUnrelatedProviderCardsAndUsesMcpResult() {
  const graphData = makeGraph()
  const result = await runStoryboardWidgetProbeTreeMcpInvocation({
    graphForRun: graphData,
    nodeIds: ['n1'],
    fallbackNode: graphData.nodes[0],
    invokeMcp: async () => bridgeResult(),
    generateProviderResponse: async () => providerStructuredText([
      { id: 'camera-lens', label: 'Choose camera lens', kind: 'text', parentNodeId: 'n1', candidateOptionId: 'camera-lens', question: 'Which cinema camera lens should frame the hero shot?', output: 'Which cinema camera lens should frame the hero shot?', rationale: 'Improves cinematic framing.', evidenceNeeded: 'Storyboard image', confidence: 'medium', probeTreeDepth: 1, nextAction: 'agenticgraph.probe.select' },
      { id: 'music-tempo', label: 'Select music tempo', kind: 'text', parentNodeId: 'n1', candidateOptionId: 'music-tempo', question: 'Which music tempo should drive the edit?', output: 'Which music tempo should drive the edit?', rationale: 'Controls pacing.', evidenceNeeded: 'Audio reference', confidence: 'medium', probeTreeDepth: 1, nextAction: 'agenticgraph.probe.select' },
    ]),
    providerModel: 'irrelevant-provider',
    onMaterialized: () => undefined,
    publishOutput: output => output.baseGraphData || null,
  })
  const labels = (result?.graphData.nodes || [])
    .filter(node => node.properties.probeTreeResponseMode === 'llm-contract')
    .map(node => node.label)
    .join(' ')
  const cards = (result?.graphData.nodes || []).filter(node => node.properties.probeTreeResponseMode === 'llm-contract')
  if (
    !result?.mcpInvoked
    || result.providerAccepted
    || result.responseSource !== 'mcp'
    || /camera|music/i.test(labels)
    || !/SME|cyber|supply-chain|coverage|adviser/i.test(labels)
    || cards.some(card => card.properties.output !== '' || !card.properties.summary)
  ) {
    throw new Error(`expected unrelated provider output to be rejected in favour of the literal MCP result, got ${JSON.stringify(result)}`)
  }
}

export async function testProbeTreeWidgetRunRejectsOverboundedProviderCardsAndUsesMcpResult() {
  const graphData = makeGraph()
  const result = await runStoryboardWidgetProbeTreeMcpInvocation({
    graphForRun: graphData,
    nodeIds: ['n1'],
    fallbackNode: graphData.nodes[0],
    invokeMcp: async () => bridgeResult(),
    generateProviderResponse: async () => providerStructuredText(Array.from({ length: 5 }, (_, index) => ({
      id: `provider-card-${index + 1}`,
      label: `Assess SME cyber evidence ${index + 1}`,
      kind: 'text',
      parentNodeId: 'n1',
      candidateOptionId: `provider-card-${index + 1}`,
      question: `Which SME cyber coverage source confirms supply-chain risk ${index + 1}?`,
      output: `Which SME cyber coverage source confirms supply-chain risk ${index + 1}?`,
      rationale: 'Keeps the SME cyber finding source-backed.',
      evidenceNeeded: 'Current coverage and supply-chain evidence',
      confidence: 'medium',
      probeTreeDepth: 1,
      nextAction: 'agenticgraph.probe.select',
    }))),
    providerModel: 'overbounded-provider',
    onMaterialized: () => undefined,
    publishOutput: output => output.baseGraphData || null,
  })
  const cards = (result?.graphData.nodes || []).filter(node => node.properties.probeTreeResponseMode === 'llm-contract')
  if (
    !result?.mcpInvoked
    || result.providerAccepted
    || result.responseSource !== 'mcp'
    || cards.length !== 3
    || cards.some(card => card.properties.output !== '' || !card.properties.summary)
    || cards.some(card => /^Assess SME cyber evidence/i.test(card.label))
  ) {
    throw new Error(`expected a five-card provider envelope to be rejected in favour of the bounded MCP result, got ${JSON.stringify(result)}`)
  }
}

export async function testProbeTreeWidgetRunRefusesGenericNoModelFallback() {
  const authoredRequest = '/agenticgraph.probe-tree invest in China, India, SE Asia?'
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'investment-root', type: 'TextGeneration', label: 'Widget Card', properties: { prompt: authoredRequest } }],
    edges: [],
  }
  const contextText = ['Authored request:', authoredRequest, 'Selected Widget id: investment-root'].join('\n')
  const insufficientResult = {
    isError: false,
    content: [{ type: 'text', text: 'No query-specific cards without a configured model.' }],
    structuredContent: {
      contractVersion: 'agenticgraph-probe-tree/v0.1',
      ok: false,
      degraded: true,
      degraded_reason: 'insufficient_user_input_context',
      response: buildProbeTreeStructuredResponse({
        threadRootId: 'investment-root',
        currentNodeId: 'investment-root',
        contextText,
        options: [
          {
            id: 'investment-vehicle',
            text: 'Which investment vehicle should guide the China, India, or Southeast Asia comparison?',
            rationale: 'The vehicle changes the relevant liquidity, control, and market-access evidence.',
            evidenceNeeded: 'User-selected investment vehicle.',
            selectionOptions: ['Prioritize liquid public-market exposure', 'Prefer private-market fund access', 'Require direct operating control'],
            contextAnchors: ['China', 'India', 'SE Asia'],
          },
          {
            id: 'investment-objective',
            text: 'Which investment objective should drive the China, India, or Southeast Asia recommendation?',
            rationale: 'The objective changes how return, income, and strategic access should be compared.',
            evidenceNeeded: 'User-selected investment objective.',
            selectionOptions: ['Maximize long-term capital growth', 'Prioritize recurring income yield', 'Require strategic market access'],
            contextAnchors: ['invest', 'India', 'SE Asia'],
          },
        ],
      }),
      cost_log: { model: 'none', prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 },
    },
  }
  let published = false
  let errorMessage = ''
  try {
    await runStoryboardWidgetProbeTreeMcpInvocation({
      graphForRun: graphData,
      nodeIds: ['investment-root'],
      fallbackNode: graphData.nodes[0],
      invokeMcp: async () => ({ ...bridgeResult(), result: insufficientResult }),
      onMaterialized: () => undefined,
      publishOutput: output => {
        published = true
        return output.baseGraphData || null
      },
    })
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error || '')
  }
  if (
    published
    || !errorMessage.includes('received no accepted 2-4 query-specific LLM cards')
    || !errorMessage.includes('zero-model MCP path does not synthesize fallback cards')
  ) {
    throw new Error(`expected no-model investment clarification to fail closed without publishing canned cards, got ${JSON.stringify({ published, errorMessage })}`)
  }
}

export async function testProbeTreeWidgetRunSurfacesProviderTransportFailure() {
  const graphData = makeGraph()
  let errorMessage = ''
  try {
    await runStoryboardWidgetProbeTreeMcpInvocation({
      graphForRun: graphData,
      nodeIds: ['n1'],
      fallbackNode: graphData.nodes[0],
      invokeMcp: async () => { throw new Error('local MCP unavailable') },
      generateProviderResponse: async () => { throw new Error('The API key format is incorrect.') },
      onMaterialized: () => undefined,
      publishOutput: output => output.baseGraphData || null,
    })
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error || '')
  }
  if (
    !errorMessage.includes('Probe-Tree LLM request failed: The API key format is incorrect.')
    || errorMessage.includes('received no accepted 2-4 query-specific LLM cards')
  ) {
    throw new Error(`expected the provider transport failure to remain distinct from semantic card rejection, got ${errorMessage}`)
  }
}

export async function testProbeTreeWidgetRunIncludesUserOutputInMcpAndProviderContext() {
  const userAnswer = 'Require current policy, regulator, and licensed-adviser evidence for Singapore and Malaysia cyber and supply-chain coverage gaps.'
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      {
        id: 'probe-root',
        type: 'TextGeneration',
        label: 'SME risk review',
        properties: {
          summary: '/agenticgraph.probe-tree Assess SME cyber and supply-chain coverage.',
          probeTreeDepth: 0,
        },
      },
      {
        id: 'probe-answer',
        type: 'TextGeneration',
        label: 'Which cyber schedule is authoritative?',
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          summary: 'Which cyber schedule is authoritative?',
          output: userAnswer,
          action: 'Use the answer to generate the next bounded branch.',
          parentNodeId: 'probe-root',
          probeTreeResponseMode: 'llm-contract',
          probeTreeDepth: 3,
        },
      },
    ],
    edges: [{ id: 'probe-root-answer', source: 'probe-root', target: 'probe-answer', label: 'candidateOption', properties: {} }],
  }
  let mcpRequest: Record<string, unknown> | null = null
  let providerPrompt = ''
  const result = await runStoryboardWidgetProbeTreeMcpInvocation({
    graphForRun: graphData,
    nodeIds: ['probe-root', 'probe-answer'],
    fallbackNode: graphData.nodes[1],
    invokeMcp: async request => {
      mcpRequest = request as unknown as Record<string, unknown>
      throw new Error('exercise bounded local fallback')
    },
    generateProviderResponse: async promptText => {
      providerPrompt = promptText
      return providerStructuredText([
        {
          id: 'country-cyber-coverage',
          label: 'Which Singapore or Malaysia cyber coverage gap should guide the next branch?',
          kind: 'text',
          parentNodeId: 'probe-answer',
          candidateOptionId: 'country-cyber-coverage',
          question: 'Which Singapore or Malaysia cyber coverage gap should guide the next branch?',
          output: '',
          rationale: 'Uses the selected child country and cyber coverage request.',
          evidenceNeeded: 'User-selected country coverage gap.',
          selectionOptions: [
            { id: 'singapore-cyber', label: 'Prioritize Singapore incident-response exclusions' },
            { id: 'malaysia-cyber', label: 'Prioritize Malaysia supplier-coverage exclusions' },
          ],
          contextAnchors: ['Singapore', 'Malaysia', 'cyber', 'coverage gaps'],
          confidence: 'medium',
          probeTreeDepth: 4,
          nextAction: 'agenticgraph.probe.select',
        },
        {
          id: 'supply-chain-evidence',
          label: 'Which supply-chain evidence should guide the licensed-adviser review?',
          kind: 'text',
          parentNodeId: 'probe-answer',
          candidateOptionId: 'supply-chain-evidence',
          question: 'Which supply-chain evidence should guide the licensed-adviser review?',
          output: '',
          rationale: 'Uses the selected child evidence and adviser request.',
          evidenceNeeded: 'User-selected evidence source.',
          selectionOptions: [
            { id: 'current-policy', label: 'Prioritize recently issued regulator guidance' },
            { id: 'regulator', label: 'Require jurisdiction-specific policy conflicts' },
            { id: 'licensed-adviser', label: 'Escalate evidence gaps for adviser review' },
          ],
          contextAnchors: ['supply-chain', 'current policy', 'regulator', 'licensed-adviser evidence'],
          confidence: 'medium',
          probeTreeDepth: 4,
          nextAction: 'agenticgraph.probe.select',
        },
      ])
    },
    onMaterialized: () => undefined,
    publishOutput: output => output.baseGraphData || null,
  })
  const childCards = (result?.graphData.nodes || []).filter(node => node.properties.parentNodeId === 'probe-answer')
  const childCardContent = JSON.stringify(childCards.map(card => ({
    label: card.label,
    options: card.properties.selectionOptions,
    anchors: card.properties.probeTreeUserInputAnchors,
  }))).toLowerCase().replace(/-/g, ' ')
  const expectedOutputTopics = ['singapore', 'malaysia', 'cyber', 'supply chain', 'coverage', 'gaps']
  if (
    !result
    || !String(mcpRequest?.contextText || '').includes(userAnswer)
    || !String(mcpRequest?.contextText || '').startsWith(`Authored request:\n${userAnswer}`)
    || mcpRequest?.threadRootId !== 'probe-root'
    || mcpRequest?.currentNodeId !== 'probe-answer'
    || mcpRequest?.probeTreeDepth !== 4
    || mcpRequest?.recallTopK !== 0
    || !providerPrompt.includes(userAnswer)
    || !providerPrompt.includes(`"activeSelectedInput": "${userAnswer}"`) || !providerPrompt.includes('"precedingQuestionAndLineage": "Which cyber schedule is authoritative?')
    || providerPrompt.includes('Selected Widget id:') || providerPrompt.includes('Agentic OS directives:')
    || !providerPrompt.includes('depth 4')
    || childCards.length < 2
    || childCards.some(card => card.properties.parentNodeId !== 'probe-answer')
    || childCards.some(card => card.properties.probeTreeThreadRootId !== 'probe-root')
    || childCards.some(card => card.properties.probeTreeDepth !== 4)
    || expectedOutputTopics.some(topic => !childCardContent.includes(topic))
    || childCards.some(card => !Array.isArray(card.properties.selectionOptions) || card.properties.selectionOptions.length < 2)
    || childCards.some(card => !Array.isArray(card.properties.probeTreeUserInputAnchors) || card.properties.probeTreeUserInputAnchors.length < 2)
    || /current primary source for|verified system-of-record fact for/i.test(childCardContent)
  ) {
    throw new Error(`expected Output -> Run to preserve thread root, increment depth, and materialize child branches, got ${JSON.stringify({ result, mcpRequest, providerPrompt })}`)
  }
}

export function testProbeTreeContinuationMetadataRoutesWithoutVisibleSlashToken() {
  const node: GraphNode = {
    id: 'probe-answer',
    type: 'TextGeneration',
    label: 'Which cyber schedule is authoritative?',
    properties: {
      summary: 'Which cyber schedule is authoritative?',
      output: 'The endorsed schedule is authoritative.',
      parentNodeId: 'probe-root',
      cardTypeLabel: 'Probe-Tree Card',
    },
  }
  const invocationText = readStoryboardWidgetProbeTreeInvocationText(node)
  if (invocationText.includes('/agenticgraph.probe-tree') || resolveStoryboardWidgetProbeTreeInvocationTokenForNode(node, invocationText) !== '/agenticgraph.probe-tree') {
    throw new Error(`expected generated Probe-Tree metadata to route continuation without exposing a slash token, got ${invocationText}`)
  }
}

export async function testProbeTreeGenerateRequestStopsContinuationAndPublishesDeliverable() {
  const userAnswer = '1. A) Target annual premium level to constrain overall cost and influence coverage limits. Other: generate negotiation strategy with agent'
  const terminalRequest = 'generate negotiation strategy with agent'
  const typedCell = (key: string, type: string, value: unknown) => ({ key, type, value })
  const rootNode: GraphNode = {
    id: 'probe-root',
    type: 'TextGeneration',
    label: 'SME risk review',
    properties: { summary: '/agenticgraph.probe-tree Assess the root SME risk scope.' },
  }
  const selectedChild: GraphNode = {
    id: typedCell('id', 'string', 'probe-child') as unknown as string,
    type: typedCell('type', 'string', 'TextGeneration') as unknown as string,
    label: typedCell('label', 'string', 'Which parameter should shape the Malaysia SME insurance package?') as unknown as string,
    x: 520,
    y: 180,
    properties: typedCell('properties', 'object', {
      cardTypeLabel: 'Probe-Tree Card',
      probeTreeResponseMode: 'llm-contract',
      probeTreeThreadRootId: 'probe-root',
      probeTreeDepth: 2,
      parentNodeId: 'probe-root',
      summary: 'Which parameter should shape the Malaysia SME insurance package?',
      output: userAnswer,
    }) as unknown as GraphNode['properties'],
  }
  const staleChildAlias: GraphNode = {
    id: 'probe-child',
    type: 'TextGeneration',
    label: 'Root writeback alias',
    properties: {
      summary: 'Root alias should not own the continuation.',
      output: 'stale alias output',
    },
  }
  const selectedRunNode = resolveStoryboardWidgetProbeTreeSelectedRunNode({
    requestedNodeId: 'probe-child',
    fallbackNode: staleChildAlias,
    candidates: [staleChildAlias, selectedChild],
  })
  const rootAliasGraph: GraphData = { type: 'Graph', nodes: [rootNode, staleChildAlias], edges: [] }
  let mcpCalls = 0
  let providerPrompt = ''
  let publishedOutput: Record<string, unknown> | null = null
  const result = await runStoryboardWidgetProbeTreeMcpInvocation({
    graphForRun: rootAliasGraph,
    nodeIds: ['probe-root', 'probe-child'],
    fallbackNode: selectedRunNode,
    invokeMcp: async () => {
      mcpCalls += 1
      throw new Error('terminal generation must not invoke Probe-Tree MCP')
    },
    generateProviderResponse: async promptText => {
      providerPrompt = promptText
      return '# Generated deliverable\n\nThe requested report is now the terminal output.'
    },
    onMaterialized: () => undefined,
    publishOutput: output => {
      publishedOutput = output as unknown as Record<string, unknown>
      return output.baseGraphData || null
    },
  })
  const nodes = result?.graphData.nodes || []
  const persistedChild = nodes.find(node => String(unwrapGraphCellValue(node.id) || '') === 'probe-child')
  const continuationCards = nodes.filter(node => node.properties.parentNodeId === 'probe-child')
  const publishedText = String(publishedOutput?.outputText || '')
  if (
    mcpCalls !== 0
    || !providerPrompt.includes(userAnswer)
    || !providerPrompt.includes(`"request": "${terminalRequest}"`)
    || !providerPrompt.includes('Do not ask a clarification question, emit Probe-Tree cards, or continue Probe-Tree.')
    || !providerPrompt.includes('Never backfill missing content from fixtures, hardcoded use-case tables') || !providerPrompt.includes('provider, model, tool, product, repository, or domain identity')
    || !persistedChild
    || persistedChild.properties.summary !== 'Which parameter should shape the Malaysia SME insurance package?'
    || persistedChild.properties.output !== userAnswer
    || String(persistedChild.label) === 'Root writeback alias'
    || continuationCards.length !== 0
    || result?.mcpInvoked !== false
    || result?.providerAccepted !== true
    || result?.materializedNodeIds.length !== 0
    || !result?.message.includes('without continuing Probe-Tree')
    || publishedOutput?.panelLabel !== 'Generated Result'
    || publishedOutput?.outputKey !== 'probe-tree-generated-result'
    || publishedOutput?.allowCreateStandaloneOutput !== true
    || !publishedText.startsWith('---\nschema: "agenticgraph-rich-media-text/v1"\n')
    || !publishedText.includes('# Generated deliverable')
    || /<!doctype|<html\b/i.test(publishedText)
  ) {
    throw new Error(`expected imperative generation to publish the deliverable without continuing Probe-Tree, got ${JSON.stringify({ mcpCalls, providerPrompt, publishedOutput, result, nodes })}`)
  }
}

export async function testProbeTreeWidgetRunStopsBeforeMcpAtDepthLimit() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'probe-depth-eight',
      type: 'TextGeneration',
      label: 'Depth-limited Probe-Tree Card',
      properties: {
        cardTypeLabel: 'Probe-Tree Card',
        prompt: '/agenticgraph.probe-tree',
        summary: 'What remains unresolved?',
        output: 'The final bounded answer.',
        probeTreeDepth: 8,
        probeTreeThreadRootId: 'probe-root',
      },
    }],
    edges: [],
  }
  let mcpCalls = 0
  let providerCalls = 0
  const result = await runStoryboardWidgetProbeTreeMcpInvocation({
    graphForRun: graphData,
    nodeIds: ['probe-depth-eight'],
    fallbackNode: graphData.nodes[0],
    invokeMcp: async () => { mcpCalls += 1; return bridgeResult() },
    generateProviderResponse: async () => { providerCalls += 1; return null },
    onMaterialized: () => undefined,
    publishOutput: output => output.baseGraphData || null,
  })
  if (result?.kind !== 'warning' || !result.message.includes('8-branch depth limit') || mcpCalls !== 0 || providerCalls !== 0 || result.materializedNodeIds.length !== 0) {
    throw new Error(`expected depth 8 to stop visibly before MCP/provider spend, got ${JSON.stringify({ result, mcpCalls, providerCalls })}`)
  }
}
