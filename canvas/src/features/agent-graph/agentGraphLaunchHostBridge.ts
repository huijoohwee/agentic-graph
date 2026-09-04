import React from 'react'
import {
  registerMarkdownWorkspaceActionBridge,
} from '@/features/markdown-explorer/workspaceActionBridge'
import {
  createAgentGraphHostAdapter,
  type AgentGraphHostAdapterOptions,
} from './agentGraphHostAdapter'

const AGENT_GRAPH_HOST_ENABLED = import.meta.env?.DEV === true
  || import.meta.env?.VITE_AGENTIC_OS_AGENT_GRAPH_HOST === 'same-origin'

export function registerAgentGraphLaunchHostBridge({
  enabled = AGENT_GRAPH_HOST_ENABLED,
  adapterOptions,
}: {
  enabled?: boolean
  adapterOptions?: AgentGraphHostAdapterOptions
} = {}): () => void {
  if (!enabled) return () => undefined
  return registerMarkdownWorkspaceActionBridge('agent-graph-launch-host', {
    agentGraph: createAgentGraphHostAdapter(adapterOptions),
  })
}

export function useAgentGraphLaunchHostBridge(): void {
  React.useEffect(() => registerAgentGraphLaunchHostBridge(), [])
}
