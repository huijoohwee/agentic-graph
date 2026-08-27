import { AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'

export const AGENTIC_OS_DOCS_MCP_BRIDGE_PATH = '/__agenticgraph_mcp_agentic_os_docs_invoke' as const
export const AGENTIC_OS_DOCS_MCP_TOOL_NAME = 'agenticgraph.agentic_canvas_os.docs.invoke' as const
export const AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS = 12

export type AgenticOsDocsMcpInvocationResolution = {
  token: string
  ok: boolean
  kind?: string
  label?: string
  summary?: string
  sourcePath?: string
  error?: string
}

export type AgenticOsDocsRoutingProof = {
  sourceRevision: string
  catalogDigest: string
  routingSchema: typeof AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
  routingDigest: string
}

export type AgenticOsDocsMcpBridgeRequest = {
  invocationTokens: string[]
  expectedProof?: AgenticOsDocsRoutingProof
}

export type AgenticOsDocsMcpBridgeSuccess = {
  ok: true
  tool: typeof AGENTIC_OS_DOCS_MCP_TOOL_NAME
  mcpInvoked: true
  invocations: AgenticOsDocsMcpInvocationResolution[]
  sourceRevision?: string
  catalogDigest?: string
  routingSchema?: string
  routingDigest?: string
}

const isAgenticOsDocsMcpInvocationResolution = (
  value: unknown,
): value is AgenticOsDocsMcpInvocationResolution => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && typeof (value as { token?: unknown }).token === 'string'
  && typeof (value as { ok?: unknown }).ok === 'boolean',
)

export const isAgenticOsDocsMcpBridgeSuccessForTokens = (
  value: unknown,
  invocationTokens: readonly string[],
): value is AgenticOsDocsMcpBridgeSuccess => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const response = value as Partial<AgenticOsDocsMcpBridgeSuccess>
  if (
    response.ok !== true
    || response.tool !== AGENTIC_OS_DOCS_MCP_TOOL_NAME
    || response.mcpInvoked !== true
    || !Array.isArray(response.invocations)
    || response.invocations.length !== invocationTokens.length
  ) return false

  const requestedTokens = new Set(invocationTokens)
  const resolvedTokens = new Set<string>()
  for (const invocation of response.invocations) {
    if (
      !isAgenticOsDocsMcpInvocationResolution(invocation)
      || !requestedTokens.has(invocation.token)
      || resolvedTokens.has(invocation.token)
    ) return false
    resolvedTokens.add(invocation.token)
  }
  return resolvedTokens.size === requestedTokens.size
}

export const isAgenticOsDocsMcpBridgeSuccessBoundToProof = (
  value: unknown,
  invocationTokens: readonly string[],
  proof: AgenticOsDocsRoutingProof,
): value is AgenticOsDocsMcpBridgeSuccess & AgenticOsDocsRoutingProof => (
  isAgenticOsDocsMcpBridgeSuccessForTokens(value, invocationTokens)
  && value.sourceRevision === proof.sourceRevision
  && value.catalogDigest === proof.catalogDigest
  && value.routingSchema === proof.routingSchema
  && value.routingDigest === proof.routingDigest
)

export const normalizeAgenticOsDocsMcpInvocationTokens = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const candidate of value) {
    const token = String(candidate || '').trim()
    const valid = /^[/#][A-Za-z0-9_.-]{1,96}$/.test(token)
      || /^@[A-Za-z0-9_.-]{1,96}:?$/.test(token)
    if (!valid) continue
    const identity = token.toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    tokens.push(token)
    if (tokens.length >= AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS) break
  }
  return tokens
}

export const normalizeAgenticOsDocsMcpBridgeRequest = (value: unknown): AgenticOsDocsMcpBridgeRequest | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as { invocationTokens?: unknown, expectedProof?: unknown }
  const invocationTokens = normalizeAgenticOsDocsMcpInvocationTokens(
    input.invocationTokens,
  )
  if (invocationTokens.length === 0) return null
  if (input.expectedProof === undefined) return { invocationTokens }
  if (!input.expectedProof || typeof input.expectedProof !== 'object' || Array.isArray(input.expectedProof)) return null
  const candidate = input.expectedProof as Partial<AgenticOsDocsRoutingProof>
  const expectedProof = {
    sourceRevision: String(candidate.sourceRevision || '').trim(),
    catalogDigest: String(candidate.catalogDigest || '').trim(),
    routingSchema: String(candidate.routingSchema || '').trim(),
    routingDigest: String(candidate.routingDigest || '').trim(),
  }
  if (
    !/^[0-9a-f]{40}$/.test(expectedProof.sourceRevision)
    || !/^[0-9a-f]{64}$/.test(expectedProof.catalogDigest)
    || expectedProof.routingSchema !== AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
    || !/^[0-9a-f]{64}$/.test(expectedProof.routingDigest)
  ) return null
  return { invocationTokens, expectedProof: expectedProof as AgenticOsDocsRoutingProof }
}
