import { invokeProbeTreeMcpBridge } from '@/features/agent-ready/probeTreeMcpClient'
import { PROBE_TREE_MCP_BRIDGE_PATH } from '@/features/agent-ready/probeTreeMcpBridgeContract'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  PROBE_TREE_MCP_BRIDGE_TIMEOUT_MS,
  PROBE_TREE_MCP_INVOCATION_RESOLUTION_TIMEOUT_MS,
  createProbeTreeMcpRequestOptions,
  resolveProbeTreeMcpInvocationTokens,
} from '../../viteProbeTreeMcpBridge'

export async function testProbeTreeMcpClientPostsBoundedSameOriginContract() {
  let requestUrl = ''
  let requestInit: RequestInit | undefined
  const result = await invokeProbeTreeMcpBridge({
    threadRootId: 'care-root',
    currentNodeId: 'n1',
    contextText: 'Assess SME cyber risk and coverage gaps.',
    invocationTokens: ['/sme-care-agent', '@source.frontmatter', '#runtime-ready'],
    optionCount: 9,
    probeTreeDepth: 99,
    recallTopK: 99,
    tokenBudget: 99_000,
  }, (async (url, init) => {
    requestUrl = String(url)
    requestInit = init
    return new Response(JSON.stringify({
      ok: true,
      tool: 'agentic-graph.probe.generate',
      mcpInvoked: true,
      invocationResolutions: [],
      result: { structuredContent: { ok: true } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch)
  const body = JSON.parse(String(requestInit?.body || '{}')) as Record<string, unknown>
  if (
    requestUrl !== PROBE_TREE_MCP_BRIDGE_PATH
    || requestInit?.method !== 'POST'
    || body.optionCount !== 4
    || body.probeTreeDepth !== 8
    || body.recallTopK !== 20
    || body.tokenBudget !== 4000
    || result.mcpInvoked !== true
  ) {
    throw new Error(`expected bounded same-origin Probe-Tree MCP request, got ${JSON.stringify({ requestUrl, requestInit, body, result })}`)
  }
}

export async function testProbeTreeMcpBridgeUsesOneDeadlineAndParallelInvocationResolution() {
  const deadlineAt = 50_000
  const deadlineSignal = new AbortController().signal
  const connectOptions = createProbeTreeMcpRequestOptions(
    deadlineAt,
    30_000,
    Number.POSITIVE_INFINITY,
    deadlineSignal,
  )
  const docsOptions = createProbeTreeMcpRequestOptions(
    deadlineAt,
    31_000,
    PROBE_TREE_MCP_INVOCATION_RESOLUTION_TIMEOUT_MS,
    deadlineSignal,
  )
  const generateOptions = createProbeTreeMcpRequestOptions(
    deadlineAt,
    42_500,
    Number.POSITIVE_INFINITY,
    deadlineSignal,
  )
  if (
    PROBE_TREE_MCP_BRIDGE_TIMEOUT_MS !== 20_000
    || connectOptions.timeout !== 20_000
    || connectOptions.maxTotalTimeout !== 20_000
    || docsOptions.timeout !== 3_000
    || generateOptions.timeout !== 7_500
    || connectOptions.signal !== deadlineSignal
    || docsOptions.signal !== deadlineSignal
    || generateOptions.signal !== deadlineSignal
  ) {
    throw new Error(`expected one shrinking 20 second bridge deadline, got ${JSON.stringify({ connectOptions, docsOptions, generateOptions })}`)
  }
  let deadlineRejected = false
  try {
    createProbeTreeMcpRequestOptions(deadlineAt, deadlineAt)
  } catch {
    deadlineRejected = true
  }
  if (!deadlineRejected) throw new Error('expected an exhausted Probe-Tree MCP deadline to fail closed')

  let inFlight = 0
  let maxInFlight = 0
  const client = {
    callTool: async (request: { arguments?: { token?: unknown } }) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight -= 1
      const token = String(request.arguments?.token || '')
      return {
        isError: false,
        structuredContent: { ok: true, invocation: { kind: token[0], label: token } },
      }
    },
  } as unknown as Client
  const resolutions = await resolveProbeTreeMcpInvocationTokens({
    client,
    tokens: ['/one', '/ignored', '@two', '#three'],
    requestOptions: docsOptions,
  })
  if (maxInFlight !== 3 || resolutions.map(entry => entry.token).join(' ') !== '/one @two #three') {
    throw new Error(`expected parallel representative / @ # resolution, got ${JSON.stringify({ maxInFlight, resolutions })}`)
  }
}
