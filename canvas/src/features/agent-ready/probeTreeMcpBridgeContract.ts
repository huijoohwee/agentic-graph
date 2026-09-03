import { AGENTIC_OS_PROBE_TREE_TOOL_NAMES, PROBE_TREE_DEFAULTS } from './probeTreeContract.mjs'

export const PROBE_TREE_MCP_BRIDGE_PATH = '/__agentic_graph_mcp_probe_generate' as const
export const PROBE_TREE_MCP_BRIDGE_MAX_CONTEXT_CHARS = 12_000
export const PROBE_TREE_MCP_BRIDGE_MAX_INVOCATION_TOKENS = 24

export type ProbeTreeMcpInvocationResolution = {
  token: string
  ok: boolean
  kind?: string
  label?: string
  summary?: string
  sourcePath?: string
  error?: string
}

export type ProbeTreeMcpBridgeRequest = {
  threadRootId: string
  currentNodeId: string
  contextText: string
  invocationTokens: string[]
  optionCount?: number
  probeTreeDepth?: number
  recallTopK?: number
  tokenBudget?: number
}

export type ProbeTreeMcpBridgeSuccess = {
  ok: true
  tool: typeof AGENTIC_OS_PROBE_TREE_TOOL_NAMES.generate
  mcpInvoked: true
  invocationResolutions: ProbeTreeMcpInvocationResolution[]
  result: Record<string, unknown>
}

export type ProbeTreeMcpBridgeFailure = {
  ok: false
  error: string
}

export type ProbeTreeMcpBridgeResponse = ProbeTreeMcpBridgeSuccess | ProbeTreeMcpBridgeFailure

export const normalizeProbeTreeMcpInvocationTokens = (values: unknown): string[] => {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const token = String(value || '').trim()
    if (!/^[/#@][A-Za-z0-9_.-]{1,96}$/.test(token)) continue
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(token)
    if (out.length >= PROBE_TREE_MCP_BRIDGE_MAX_INVOCATION_TOKENS) break
  }
  return out
}

export const normalizeProbeTreeMcpBridgeRequest = (value: unknown): ProbeTreeMcpBridgeRequest | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const threadRootId = String(record.threadRootId || '').trim().slice(0, 160)
  const currentNodeId = String(record.currentNodeId || '').trim().slice(0, 160)
  const contextText = String(record.contextText || '').trim().slice(0, PROBE_TREE_MCP_BRIDGE_MAX_CONTEXT_CHARS)
  if (!threadRootId || !currentNodeId || !contextText) return null
  const rawOptionCount = Number(record.optionCount)
  const rawProbeTreeDepth = Number(record.probeTreeDepth)
  const rawRecallTopK = Number(record.recallTopK)
  const rawTokenBudget = Number(record.tokenBudget)
  return {
    threadRootId,
    currentNodeId,
    contextText,
    invocationTokens: normalizeProbeTreeMcpInvocationTokens(record.invocationTokens),
    optionCount: Number.isFinite(rawOptionCount)
      ? Math.max(PROBE_TREE_DEFAULTS.minOptionCount, Math.min(PROBE_TREE_DEFAULTS.maxOptionCount, Math.floor(rawOptionCount)))
      : PROBE_TREE_DEFAULTS.optionCount,
    probeTreeDepth: Number.isFinite(rawProbeTreeDepth)
      ? Math.max(1, Math.min(PROBE_TREE_DEFAULTS.maxDepth, Math.floor(rawProbeTreeDepth)))
      : 1,
    recallTopK: Number.isFinite(rawRecallTopK)
      ? Math.max(0, Math.min(20, Math.floor(rawRecallTopK)))
      : PROBE_TREE_DEFAULTS.recallTopK,
    tokenBudget: Number.isFinite(rawTokenBudget)
      ? Math.max(256, Math.min(4_000, Math.floor(rawTokenBudget)))
      : PROBE_TREE_DEFAULTS.tokenBudget,
  }
}
