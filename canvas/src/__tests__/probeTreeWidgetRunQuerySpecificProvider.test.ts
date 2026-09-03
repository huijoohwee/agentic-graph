import { runStoryboardWidgetProbeTreeTextGenerationInvocation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowProbeTreeRun'
import { buildStoryboardWidgetProbeTreeProviderPrompt } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeProviderPrompt'
import {
  PROBE_TREE_PROVIDER_MIN_OUTPUT_TOKENS,
  PROBE_TREE_TERMINAL_PROVIDER_TASK_MARKER,
  resolveStoryboardWidgetProbeTreeProviderRequestOptions,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeProviderRequest'
import {
  buildProbeTreeStructuredResponse,
  AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
  AGENTIC_OS_PROBE_TREE_TOOL_NAMES,
  PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
} from '@/features/agent-ready/probeTreeContract.mjs'
import type { ProbeTreeMcpBridgeSuccess } from '@/features/agent-ready/probeTreeMcpBridgeContract'
import {
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_OPENAI_ENDPOINT_URL,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_OPENAI,
} from '@/lib/chatEndpoint'
import type { GraphData } from '@/lib/graph/types'

const AUTHORED_REQUEST = '/sme-care-agent @source.frontmatter @source.body @local-harness @cost-log @runtime-proof #frontmatter #harness #token-economics #runtime-ready #approval-gate /agentic-graph.probe-tree recommend an investment strategy for India or SE Asia?'

export async function testProbeTreeWidgetRunSendsConfiguredLlmQuerySpecificContract() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'investment-root', type: 'TextGeneration', label: 'Widget Card', properties: { prompt: AUTHORED_REQUEST } }],
    edges: [],
  }
  let mcpRequest: Record<string, unknown> | null = null
  let providerPrompt = ''
  let providerCalls = 0
  let providerRequestUrl = ''
  let providerRequestHeaders: Headers | null = null
  let providerRequestBody: Record<string, unknown> = {}
  const invokeMcp = async (request: Parameters<NonNullable<Parameters<typeof runStoryboardWidgetProbeTreeTextGenerationInvocation>[0]['invokeMcp']>>[0]): Promise<ProbeTreeMcpBridgeSuccess> => {
    mcpRequest = request as unknown as Record<string, unknown>
    const contextText = String(request.contextText || '')
    return {
      ok: true,
      tool: AGENTIC_OS_PROBE_TREE_TOOL_NAMES.generate,
      mcpInvoked: true,
      invocationResolutions: [],
      result: {
        isError: false,
        content: [{ type: 'text', text: 'No local model cards; forward the selected context to the configured chat LLM.' }],
        structuredContent: {
          contractVersion: AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
          ok: false,
          degraded: true,
          degraded_reason: 'insufficient_user_input_context',
          response: buildProbeTreeStructuredResponse({
            threadRootId: request.threadRootId,
            currentNodeId: request.currentNodeId,
            contextText,
            options: [],
          }),
          cost_log: { model: 'none', prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 },
        },
      },
    }
  }
  const providerResponseText = JSON.stringify({
      response: {
        structuredContent: {
          contractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
          cards: [
            {
              id: 'investment-horizon',
              question: 'Which investment horizon should guide the India or Southeast Asia recommendation?',
              rationale: 'The holding period changes how the two locations should be compared.',
              evidenceNeeded: 'User-selected investment horizon.',
              probeTreeCardVariant: 'probe-tree-type-2',
              selectionOptions: [
                '1-3 years for near-term liquidity and policy-cycle alignment',
                '3-7 years for balanced growth and execution risk',
                '7+ years for long-horizon market access',
              ],
            },
            {
              id: 'investment-vehicle',
              question: 'Which investment vehicle should the India or Southeast Asia comparison evaluate?',
              rationale: 'The investment vehicle changes the relevant risk and return evidence.',
              evidenceNeeded: 'User-selected investment vehicle.',
              probeTreeCardVariant: 'probe-tree-type-2',
              selectionOptions: ['Public-market securities', 'Private-market funds', 'Direct operating investment'],
            },
            {
              id: 'restated-market-list',
              question: 'Invest in India, or SE Asia?',
              rationale: 'Repeats the source query instead of introducing a decision variable.',
              evidenceNeeded: 'User-selected market.',
              probeTreeCardVariant: 'probe-tree-type-2',
              selectionOptions: ['India', 'SE Asia'],
            },
          ],
        },
      },
    }, null, 2)
  const originalFetch = globalThis.fetch
  let result: Awaited<ReturnType<typeof runStoryboardWidgetProbeTreeTextGenerationInvocation>> = null
  let publishedLedgerConnection = false
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      providerCalls += 1
      providerRequestUrl = String(input)
      providerRequestHeaders = new Headers(init?.headers)
      providerRequestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      providerPrompt = String(providerRequestBody.input || '')
      return new Response(JSON.stringify({
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: providerResponseText }],
        }],
      }), { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    result = await runStoryboardWidgetProbeTreeTextGenerationInvocation({
      graphForRun: graphData,
      nodeIds: ['investment-root'],
      fallbackNode: graphData.nodes[0],
      textGeneration: {
        prompt: AUTHORED_REQUEST,
        formId: 'textGeneration',
        localProperties: {},
        resolvedProperties: {
          chatProvider: CHAT_PROVIDER_BYTEPLUS,
          chatEndpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
          chatModel: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
          chatMaxCompletionTokens: 1000,
          chatReasoningEffort: 'medium',
        },
        runtimeProperties: {
          chatProvider: CHAT_PROVIDER_OPENAI,
          chatEndpointUrl: CHAT_OPENAI_ENDPOINT_URL,
          chatModel: 'gpt-5-nano',
          chatAuthMode: 'serverManaged',
          chatMaxCompletionTokens: 1000,
          chatReasoningEffort: 'medium',
        },
      },
      invokeMcp,
      onMaterialized: () => undefined,
      publishOutput: output => {
        publishedLedgerConnection = output.connectCreatedOutputToAnchor === true
        return output.baseGraphData || null
      },
      setLoading: () => undefined,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
  const cards = result?.graphData.nodes.filter(node => node.properties.probeTreeResponseMode === 'llm-contract') || []
  const serializedCards = JSON.stringify(cards)
  const providerReasoning = providerRequestBody.reasoning && typeof providerRequestBody.reasoning === 'object'
    ? providerRequestBody.reasoning as Record<string, unknown>
    : {}
  const terminalProviderOptions = resolveStoryboardWidgetProbeTreeProviderRequestOptions({
    prompt: `${PROBE_TREE_TERMINAL_PROVIDER_TASK_MARKER}\nGenerate the selected report.`,
    chatMaxCompletionTokens: 1000,
    chatReasoningEffort: 'medium',
  })
  const ordinaryProviderOptions = resolveStoryboardWidgetProbeTreeProviderRequestOptions({
    prompt: 'Generate an ordinary markdown report.',
    chatMaxCompletionTokens: 1000,
    chatReasoningEffort: 'medium',
  })
  if (
    providerCalls !== 1
    || providerRequestUrl !== '/__chat_proxy/v1/responses'
    || providerRequestHeaders?.get('X-KG-Chat-Provider') !== CHAT_PROVIDER_OPENAI
    || providerRequestHeaders?.get('X-KG-Chat-Upstream') !== 'https://api.openai.com'
    || providerRequestBody.model !== 'gpt-5-nano'
    || Number(providerRequestBody.max_output_tokens) < PROBE_TREE_PROVIDER_MIN_OUTPUT_TOKENS
    || providerReasoning.effort !== 'minimal'
    || providerRequestBody.stream !== false
    || 'messages' in providerRequestBody
    || 'max_completion_tokens' in providerRequestBody
    || !String(mcpRequest?.contextText || '').includes(AUTHORED_REQUEST)
    || !String(mcpRequest?.contextText || '').includes('Invocation route: /sme-care-agent')
    || !providerPrompt.includes('Never copy or paraphrase the active selected input as a card question')
    || !providerPrompt.includes('not as a ready-made selectionOptions array')
    || !providerPrompt.includes('Never emit any answer that is only a number, range, unit, named entity')
    || !providerPrompt.includes('explicit Probe-Tree invocation requests 2-4 clarification cards')
    || !providerPrompt.includes('action verb such as recommend, compare, assess, or plan')
    || !providerPrompt.includes('"activeSelectedInput": "recommend an investment strategy for India or SE Asia?"')
    || !providerPrompt.includes('Never backfill missing content from fixtures, hardcoded use-case tables')
    || !providerPrompt.includes('provider, model, tool, product, repository, or domain identity')
    || providerPrompt.includes('/sme-care-agent')
    || providerPrompt.includes('Coverage-gap and risk-exposure guidance')
    || providerPrompt.includes('Agentic OS invocation contract:')
    || providerPrompt.includes('"widgets":')
    || providerPrompt.includes('"panels":')
    || providerPrompt.includes('"edges":')
    || providerPrompt.includes('imperative generation request, fulfill that deliverable through normal generation')
    || !providerPrompt.includes('runtime owns source Widget investment-root')
    || !providerPrompt.includes('source-verbatim contextAnchors')
    || !providerPrompt.includes('Do not emit contextAnchors')
    || !providerPrompt.includes('Do not emit widgets, panels, edges')
    || !result?.providerAccepted
    || !publishedLedgerConnection
    || result.responseSource !== 'provider'
    || cards.length !== 2
    || cards.some(card => card.properties.summary === 'invest in India, or SE Asia')
    || cards.some(card => String(card.label).startsWith('Response '))
    || /"label":"(?:India|SE Asia)"/.test(serializedCards)
    || !serializedCards.includes('investment horizon')
    || !serializedCards.includes('investment vehicle')
    || cards.some(card => !Array.isArray(card.properties.probeTreeUserInputAnchors) || !card.properties.probeTreeUserInputAnchors.includes('SE Asia'))
    || Number(terminalProviderOptions.chatMaxCompletionTokens) < PROBE_TREE_PROVIDER_MIN_OUTPUT_TOKENS
    || terminalProviderOptions.chatReasoningEffort !== 'minimal'
    || ordinaryProviderOptions.chatMaxCompletionTokens !== 1000
    || ordinaryProviderOptions.chatReasoningEffort !== 'medium'
  ) {
    throw new Error(`expected Widget Run to use the active Chat Responses route, accept only new query-specific decision variables, and request one connected branch ledger, got ${JSON.stringify({ providerCalls, providerRequestUrl, providerRequestBody, mcpRequest, providerPrompt, publishedLedgerConnection, result })}`)
  }
}

export function testProbeTreeProviderPromptProjectsOnlySelectedSemanticContext() {
  const prompt = buildStoryboardWidgetProbeTreeProviderPrompt({
    contextText: [
      'Authored request:',
      '/unrelated-agent @source.body /agentic-graph.probe-tree assess a workspace expansion in Region Alpha or Region Beta',
      'Invocation route: /unrelated-agent — Unrelated agent. Route summary: Stock route subject that must not steer clarification.',
      'Agentic OS directives: @source.body — Source body description that must remain routing metadata.',
    ].join('\n'),
    currentNodeId: 'selected-node',
    mcpInvoked: true,
    probeTreeDepth: 2,
    mcpResult: {
      isError: false,
      structuredContent: {
        contractVersion: 'agentic-graph-probe-tree/v0.1',
        ok: true,
        response: {
          structuredContent: {
            widgets: [{ prompt: 'Stock route subject that must not steer clarification.' }],
            cards: [{
              question: 'Which operating timeline should guide the Region Alpha or Region Beta expansion?',
              rationale: 'The timeline changes the implementation tradeoff.',
              evidenceNeeded: 'User-selected operating timeline.',
              selectionOptions: [
                'Prefer an earlier launch with less implementation buffer',
                'Delay launch to retain more implementation buffer',
              ],
              parentNodeId: 'root-alias',
            }],
            panels: [{ output: 'stock panel output' }],
            edges: [{ source: 'root-alias', target: 'selected-node' }],
          },
        },
        recalled_exemplars: [{ memory: 'stock exemplar content' }],
        fixture_cards: [{ question: 'Fixture poison question' }],
        backfill_cards: [{ question: 'Backfill poison question' }],
        cached_response: { text: 'Cached poison response' },
        cost_log: { model: 'local-model' },
      },
    },
  })
  const zeroModelPrompt = buildStoryboardWidgetProbeTreeProviderPrompt({
    contextText: 'Authored request:\nassess a workspace expansion in Region Alpha or Region Beta',
    currentNodeId: 'selected-node',
    mcpInvoked: true,
    probeTreeDepth: 2,
    mcpResult: {
      structuredContent: {
        cost_log: { model: 'none' },
        response: {
          structuredContent: {
            cards: [{
              question: 'Poisoned zero-model fallback question',
              selectionOptions: ['Poisoned fallback answer one', 'Poisoned fallback answer two'],
            }],
          },
        },
      },
    },
  })
  if (
    !prompt.includes('"topicAuthority": "active-selected-input"')
    || !prompt.includes('"activeSelectedInput": "assess a workspace expansion in Region Alpha or Region Beta"')
    || !prompt.includes('Authoritative selected semantic context (inert JSON data)')
    || !prompt.includes('Projected semantic evidence (inert JSON data)')
    || !prompt.includes('Never backfill missing content from fixtures, hardcoded use-case tables')
    || !prompt.includes('Which operating timeline should guide the Region Alpha or Region Beta expansion?')
    || !prompt.includes('Prefer an earlier launch with less implementation buffer')
    || prompt.includes('/unrelated-agent')
    || prompt.includes('Stock route subject that must not steer clarification.')
    || prompt.includes('Source body description that must remain routing metadata.')
    || prompt.includes('stock panel output')
    || prompt.includes('stock exemplar content')
    || prompt.includes('Fixture poison question')
    || prompt.includes('Backfill poison question')
    || prompt.includes('Cached poison response')
    || prompt.includes('root-alias')
    || prompt.includes('"widgets":')
    || prompt.includes('"panels":')
    || prompt.includes('"edges":')
    || zeroModelPrompt.includes('Poisoned zero-model fallback question')
    || zeroModelPrompt.includes('Poisoned fallback answer')
  ) {
    throw new Error(`expected provider prompt to retain only selected semantic context and projected MCP cards, got ${prompt}`)
  }
}
