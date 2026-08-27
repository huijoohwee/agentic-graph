import { runStoryboardWidgetProbeTreeMcpInvocation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowProbeTreeRun'
import { AGENTICGRAPH_PROBE_TREE_TOOL_NAMES, PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION } from '@/features/agent-ready/probeTreeContract.mjs'
import type { ProbeTreeMcpBridgeSuccess } from '@/features/agent-ready/probeTreeMcpBridgeContract'
import type { GraphData } from '@/lib/graph/types'

const providerCards = (cards: Array<Record<string, unknown>>): string => [
  '```json',
  JSON.stringify({
    response: {
      structuredContent: {
        contractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
        cards: cards.map((card, index) => ({
          id: `provider-card-${index + 1}`,
          probeTreeCardVariant: 'probe-tree-type-2',
          ...card,
        })),
      },
    },
  }),
  '```',
].join('\n')

const zeroModelBridge = (): ProbeTreeMcpBridgeSuccess => ({
  ok: true,
  tool: AGENTICGRAPH_PROBE_TREE_TOOL_NAMES.generate,
  mcpInvoked: true,
  invocationResolutions: [],
  result: {
    isError: false,
    content: [{ type: 'text', text: 'No local model cards.' }],
    structuredContent: {
      contractVersion: 'agenticgraph-probe-tree/v0.1',
      ok: false,
      degraded: true,
      degraded_reason: 'model_unavailable',
      cost_log: { model: 'none', prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 },
    },
  },
})

export async function testProbeTreeWidgetRunFollowsUserAuthoredContinuationLanguageSwitch() {
  const userAuthoredOther = '哪里获得执照？'
  const selectedEnglishOption = 'Permit variable lead times with a backup plan for urgent local sourcing.'
  const continuationOutput = `4. ${selectedEnglishOption} Other: ${userAuthoredOther}`
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      {
        id: 'multilingual-root',
        type: 'TextGeneration',
        label: 'Widget Card',
        properties: { prompt: '/agenticgraph.probe-tree beli kedai runcit atau buah buahan dengan RM1000, cukup?' },
      },
      {
        id: 'multilingual-child',
        type: 'TextGeneration',
        label: 'What level of supplier lead time is acceptable?',
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          probeTreeResponseMode: 'llm-contract',
          probeTreeThreadRootId: 'multilingual-root',
          probeTreeDepth: 1,
          parentNodeId: 'multilingual-root',
          summary: 'What level of supplier lead time is acceptable?',
          output: continuationOutput,
        },
      },
    ],
    edges: [{ id: 'root-child', source: 'multilingual-root', target: 'multilingual-child', label: 'candidateOption', properties: {} }],
  }
  const prompts: string[] = []
  const responses = [
    providerCards([
      {
        question: 'Which inventory turnover target should guide the next purchase?',
        rationale: 'This response ignores the active authored input.',
        evidenceNeeded: 'A stock preference.',
        selectionOptions: ['Prioritize rapid stock turnover', 'Favor a broader slower-moving assortment'],
      },
      {
        question: 'Which supplier schedule should guide replenishment?',
        rationale: 'This response remains in the preceding language.',
        evidenceNeeded: 'A delivery preference.',
        selectionOptions: ['Require predictable weekly delivery', 'Allow flexible delivery windows'],
      },
    ]),
    providerCards([
      {
        question: '您希望在哪里获得经营执照？',
        rationale: '办理地点会改变负责机构和申请步骤。',
        evidenceNeeded: '用户偏好的办理地点。',
        selectionOptions: ['优先在当地政府服务窗口办理', '先通过官方线上门户提交申请'],
      },
      {
        question: '获得执照前，您想先核实哪项要求？',
        rationale: '先核实关键要求可以减少重复申请。',
        evidenceNeeded: '用户希望优先确认的申请条件。',
        selectionOptions: ['先确认适用的经营许可类别', '先确认所需材料和审批时限'],
      },
    ]),
  ]
  const result = await runStoryboardWidgetProbeTreeMcpInvocation({
    graphForRun: graphData,
    nodeIds: ['multilingual-child'],
    fallbackNode: graphData.nodes[1],
    invokeMcp: async () => zeroModelBridge(),
    generateProviderResponse: async prompt => {
      prompts.push(prompt)
      return responses[prompts.length - 1] || null
    },
    providerModel: 'test-provider',
    onMaterialized: () => undefined,
    publishOutput: output => output.baseGraphData || null,
  })
  const cards = (result?.graphData.nodes || []).filter(node => node.properties.parentNodeId === 'multilingual-child')
  const serializedCards = JSON.stringify(cards)
  const activeInputProjection = `"activeSelectedInput": "${userAuthoredOther}"`
  if (
    prompts.length !== 2
    || !prompts[0]?.includes(activeInputProjection)
    || prompts[0]?.includes(`"activeSelectedInput": "${selectedEnglishOption}`)
    || !prompts[0]?.includes('dominant natural language and script of the active selected input')
    || !prompts[1]?.includes('Preserve the dominant natural language and script of the active selected input during repair')
    || result?.providerAttempts !== 2
    || !result.providerAccepted
    || result.responseSource !== 'provider'
    || cards.length !== 2
    || !serializedCards.includes('经营执照')
    || !serializedCards.includes('核实哪项要求')
    || cards.some(card => !Array.isArray(card.properties.probeTreeUserInputAnchors) || card.properties.probeTreeUserInputAnchors.length < 2)
    || !result.panelOutput.includes('您希望在哪里获得经营执照？')
    || !result.panelOutput.includes('先确认适用的经营许可类别')
    || result.panelOutput.includes('Other (author a different answer)')
    || result.panelOutput.includes('Why:')
    || result.panelOutput.includes('Evidence:')
    || result.panelOutput.includes('Source node:')
  ) {
    throw new Error(`expected authored continuation text to own a script-neutral two-attempt repair and ledger, got ${JSON.stringify({ prompts, result, cards })}`)
  }
}
