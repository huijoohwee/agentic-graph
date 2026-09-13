import { agentGraphHostFetch } from '../agent-graph/agentGraphHostAdapter'
import {
  PROBE_TREE_MCP_BRIDGE_PATH,
  normalizeProbeTreeMcpBridgeRequest,
  type ProbeTreeMcpBridgeRequest,
  type ProbeTreeMcpBridgeSuccess,
} from './probeTreeMcpBridgeContract'

const readFailureMessage = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json() as { error?: unknown }
    return String(payload?.error || '').trim()
  } catch {
    return ''
  }
}

export async function invokeProbeTreeMcpBridge(
  request: ProbeTreeMcpBridgeRequest,
  fetchImpl: typeof fetch = agentGraphHostFetch,
): Promise<ProbeTreeMcpBridgeSuccess> {
  const boundedRequest = normalizeProbeTreeMcpBridgeRequest(request)
  if (!boundedRequest) throw new Error('Probe-Tree MCP request is incomplete.')
  const response = await fetchImpl(PROBE_TREE_MCP_BRIDGE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(boundedRequest),
  })
  if (!response.ok) {
    throw new Error(await readFailureMessage(response) || `Probe-Tree MCP bridge failed (${response.status}).`)
  }
  const payload = await response.json() as Partial<ProbeTreeMcpBridgeSuccess> & { error?: unknown }
  if (payload.ok !== true || payload.mcpInvoked !== true || !payload.result || typeof payload.result !== 'object') {
    throw new Error(String(payload.error || '').trim() || 'Probe-Tree MCP bridge returned an invalid response.')
  }
  if (boundedRequest.sourceBinding && (JSON.stringify(payload.sourceBinding) !== JSON.stringify(boundedRequest.sourceBinding)
    || typeof payload.groundedContext !== 'string' || payload.groundedContext.length > 12000)) throw new Error('Probe-Tree source binding changed during generation.')
  return payload as ProbeTreeMcpBridgeSuccess
}
