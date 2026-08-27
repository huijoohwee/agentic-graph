import React from 'react'
import {
  registerMarkdownWorkspaceActionBridge,
} from '@/features/markdown-explorer/workspaceActionBridge'
import {
  createKnowledgeGraphHostAdapter,
  type KnowledgeGraphHostAdapterOptions,
} from './knowledgeGraphHostAdapter'

const KNOWLEDGE_GRAPH_HOST_ENABLED = import.meta.env?.DEV === true
  || import.meta.env?.VITE_AGENTICGRAPH_KNOWLEDGE_GRAPH_HOST === 'same-origin'

export function registerKnowledgeGraphLaunchHostBridge({
  enabled = KNOWLEDGE_GRAPH_HOST_ENABLED,
  adapterOptions,
}: {
  enabled?: boolean
  adapterOptions?: KnowledgeGraphHostAdapterOptions
} = {}): () => void {
  if (!enabled) return () => undefined
  return registerMarkdownWorkspaceActionBridge('knowledge-graph-launch-host', {
    knowledgeGraph: createKnowledgeGraphHostAdapter(adapterOptions),
  })
}

export function useKnowledgeGraphLaunchHostBridge(): void {
  React.useEffect(() => registerKnowledgeGraphLaunchHostBridge(), [])
}
