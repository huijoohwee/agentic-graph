import { AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION } from './agenticOsDocInvocations'

export { AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION } from './agenticOsDocInvocations'

export const AGENTICGRAPH_PROBE_TREE_PROMPT_PRESET_ID = 'agenticgraph-probe-tree' as const
export const AGENTICGRAPH_PROBE_TREE_PROMPT_PRESET_ALIAS = '/agenticgraph-probe-tree-prompt-preset' as const
export const AGENTICGRAPH_PROBE_TREE_GENERATE_TOOL_NAME = 'agenticgraph.probe.generate' as const
export const AGENTICGRAPH_PROBE_TREE_SELECT_TOOL_NAME = 'agenticgraph.probe.select' as const
export const AGENTICGRAPH_PROBE_TREE_MAX_DEPTH = 8 as const

export const AGENTICGRAPH_PROBE_TREE_INVOCATION_TOKENS = [
  AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand,
  AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION.atToken,
  AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION.hashToken,
] as const

export function buildAgenticGraphProbeTreePromptPreset(request = ''): string {
  const authoredRequest = String(request || '').trim()
  return [
    AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand,
    authoredRequest || 'Generate 2-4 bounded, editable next-question cards from this Widget Card. Keep the source card unchanged, connect each candidate branch, and publish the branch summary to a separate Rich Media Panel.',
  ].join('\n\n')
}

export function isAgenticGraphProbeTreePromptPreset(value: unknown): boolean {
  const text = String(value || '').trim()
  if (!text) return false
  const firstLineTokens = new Set(String(text.split(/\r?\n/, 1)[0] || '').trim().split(/\s+/).filter(Boolean))
  return firstLineTokens.size === 1
    && firstLineTokens.has(AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand)
    && text.length > AGENTICGRAPH_PROBE_TREE_DOC_INVOCATION.slashCommand.length
}
