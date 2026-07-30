import {
  AGENTIC_OS_DOCS_MCP_BRIDGE_PATH,
  isAgenticOsDocsMcpBridgeSuccessBoundToProof,
  isAgenticOsDocsMcpBridgeSuccessForTokens,
  normalizeAgenticOsDocsMcpBridgeRequest,
  type AgenticOsDocsMcpBridgeRequest,
  type AgenticOsDocsMcpBridgeSuccess,
} from './agenticOsDocsMcpBridgeContract'

const readFailureMessage = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json() as { error?: unknown }
    return String(payload?.error || '').trim()
  } catch {
    return ''
  }
}

export async function invokeAgenticOsDocsMcpBridge(
  request: AgenticOsDocsMcpBridgeRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AgenticOsDocsMcpBridgeSuccess> {
  const boundedRequest = normalizeAgenticOsDocsMcpBridgeRequest(request)
  if (!boundedRequest) throw new Error('Agentic OS docs MCP request requires at least one valid invocation token.')
  const response = await fetchImpl(AGENTIC_OS_DOCS_MCP_BRIDGE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(boundedRequest),
  })
  if (!response.ok) {
    throw new Error(await readFailureMessage(response) || `Agentic OS docs MCP bridge failed (${response.status}).`)
  }
  const payload = await response.json() as unknown
  if (!isAgenticOsDocsMcpBridgeSuccessForTokens(payload, boundedRequest.invocationTokens)) {
    const error = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? String((payload as { error?: unknown }).error || '').trim()
      : ''
    throw new Error(error || 'Agentic OS docs MCP bridge did not cover every requested invocation token.')
  }
  if (
    boundedRequest.expectedProof
    && !isAgenticOsDocsMcpBridgeSuccessBoundToProof(
      payload,
      boundedRequest.invocationTokens,
      boundedRequest.expectedProof,
    )
  ) {
    throw new Error('Agentic OS docs MCP bridge routing proof changed during exact token resolution.')
  }
  return payload
}
