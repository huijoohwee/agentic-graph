import {
  AGENTIC_OS_DOCS_MCP_BRIDGE_PATH,
  AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS,
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
  normalizeAgenticOsDocsMcpInvocationTokens,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { invokeAgenticOsDocsMcpBridge } from '@/features/agent-ready/agenticOsDocsMcpClient'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  AGENTIC_OS_DOCS_MCP_BRIDGE_TIMEOUT_MS,
  resolveAgenticOsDocsMcpInvocationTokens,
} from '../../viteProbeTreeMcpBridge'

export async function testAgenticOsDocsMcpBridgeResolvesEveryNormalizedTokenWithinBounds() {
  const candidates = [
    '/one',
    '/two',
    '@url:',
    '@source.two',
    '#ready',
    '#verified',
    '/three',
    '@source.three',
    '#documented',
    '/four',
    '@source.four',
    '#bounded',
    '/beyond-bound',
    '/ONE',
    'invalid',
  ]
  const tokens = normalizeAgenticOsDocsMcpInvocationTokens(candidates)
  const calledTokens: string[] = []
  let maxInFlight = 0
  let inFlight = 0
  const requestOptions = {
    timeout: AGENTIC_OS_DOCS_MCP_BRIDGE_TIMEOUT_MS,
    maxTotalTimeout: AGENTIC_OS_DOCS_MCP_BRIDGE_TIMEOUT_MS,
  }
  const client = {
    callTool: async (
      request: { name?: unknown; arguments?: { token?: unknown; includeContent?: unknown; limit?: unknown } },
      _resultSchema: unknown,
      options: unknown,
    ) => {
      const token = String(request.arguments?.token || '')
      if (
        request.name !== AGENTIC_OS_DOCS_MCP_TOOL_NAME
        || request.arguments?.includeContent !== false
        || request.arguments?.limit !== 1
        || options !== requestOptions
      ) throw new Error(`unexpected docs MCP call contract for ${token}`)
      calledTokens.push(token)
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 2))
      inFlight -= 1
      return {
        isError: false,
        structuredContent: { ok: true, invocation: { kind: token[0], label: token } },
      }
    },
  } as unknown as Client

  const resolutions = await resolveAgenticOsDocsMcpInvocationTokens({ client, tokens, requestOptions })
  if (
    tokens.length !== AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS
    || !tokens.includes('@url:')
    || tokens.includes('@url')
    || maxInFlight !== AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS
    || calledTokens.join(' ') !== tokens.join(' ')
    || resolutions.map(resolution => resolution.token).join(' ') !== tokens.join(' ')
    || resolutions.some(resolution => resolution.ok !== true)
  ) {
    throw new Error(`expected every bounded token to resolve through the read-only docs tool, got ${JSON.stringify({ tokens, calledTokens, maxInFlight, resolutions })}`)
  }
}

export async function testAgenticOsDocsMcpClientRejectsIncompleteInvocationCoverage() {
  const invocationTokens = ['/one', '/two', '@source.body', '#runtime-ready']
  let rejected = false
  try {
    await invokeAgenticOsDocsMcpBridge({ invocationTokens }, (async (url, init) => {
      if (url !== AGENTIC_OS_DOCS_MCP_BRIDGE_PATH || init?.method !== 'POST') {
        throw new Error('unexpected Agentic OS docs MCP request')
      }
      return new Response(JSON.stringify({
        ok: true,
        tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
        mcpInvoked: true,
        invocations: [
          { token: '/one', ok: true },
          { token: '@source.body', ok: true },
          { token: '#runtime-ready', ok: true },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch)
  } catch (error) {
    rejected = /did not cover every requested invocation token/i.test(
      error instanceof Error ? error.message : String(error),
    )
  }
  if (!rejected) throw new Error('expected missing /two MCP resolution to fail closed')
}

export async function testAgenticOsDocsMcpClientRejectsRoutingProofDrift() {
  const invocationTokens = ['/source.ingest', '#source.graph', '@source.root']
  const expectedProof = {
    sourceRevision: 'a'.repeat(40),
    catalogDigest: 'b'.repeat(64),
    routingSchema: 'agentic-canvas-os-docs-routing/v1' as const,
    routingDigest: 'c'.repeat(64),
  }
  let rejected = false
  try {
    await invokeAgenticOsDocsMcpBridge({ invocationTokens, expectedProof }, (async () => (
      new Response(JSON.stringify({
        ok: true,
        tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
        mcpInvoked: true,
        ...expectedProof,
        routingDigest: 'd'.repeat(64),
        invocations: invocationTokens.map(token => ({ token, ok: true })),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )) as typeof fetch)
  } catch (error) {
    rejected = /routing proof changed/i.test(error instanceof Error ? error.message : String(error))
  }
  if (!rejected) throw new Error('expected exact token resolution to reject routing proof drift')
}
