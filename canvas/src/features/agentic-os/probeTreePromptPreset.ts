import { AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION } from './agenticOsDocInvocations'

export { AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION } from './agenticOsDocInvocations'

export const AGENTIC_OS_PROBE_TREE_PROMPT_PRESET_ID = 'agentic-graph-probe-tree' as const
export const AGENTIC_OS_PROBE_TREE_PROMPT_PRESET_ALIAS = '/agentic-graph-probe-tree-prompt-preset' as const
export const AGENTIC_OS_PROBE_TREE_GENERATE_TOOL_NAME = 'agentic-graph.probe.generate' as const
export const AGENTIC_OS_PROBE_TREE_SELECT_TOOL_NAME = 'agentic-graph.probe.select' as const
export const AGENTIC_OS_PROBE_TREE_MAX_DEPTH = 8 as const

export const AGENTIC_OS_PROBE_TREE_INVOCATION_TOKENS = [
  AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand,
  AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION.atToken,
  AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION.hashToken,
] as const

export function buildAgenticGraphProbeTreePromptPreset(request = ''): string {
  const authoredRequest = String(request || '').trim()
  return [
    AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand,
    authoredRequest || 'Generate 2-4 bounded, editable next-question cards from this Widget Card. Keep the source card unchanged, connect each candidate branch, and publish the branch summary to a separate Rich Media Panel.',
  ].join('\n\n')
}

export function isAgenticGraphProbeTreePromptPreset(value: unknown): boolean {
  const text = String(value || '').trim()
  if (!text) return false
  const firstLineTokens = new Set(String(text.split(/\r?\n/, 1)[0] || '').trim().split(/\s+/).filter(Boolean))
  return firstLineTokens.size === 1
    && firstLineTokens.has(AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand)
    && text.length > AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand.length
}
