import { useEffect, useState } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { WorkspaceCodebaseIndex } from '@/features/agent-graph/agentGraphWorkspaceIndex'
import type { RunTrace } from './missionControlProjection'

export type MissionCodebaseIndex = { index: WorkspaceCodebaseIndex; reference?: { path: string; value: Record<string, unknown> } }
const pending = new Map<string, Promise<MissionCodebaseIndex | undefined>>()

/** Discover retained native indexes on demand. Workflow refreshes do not parse or re-import code. */
export function useAgentMissionCodebaseIndex(trace?: RunTrace | null) {
  const identity = useGraphStore(state => state.graphData?.metadata?.agentGraphProjection) as Record<string, unknown> | undefined
  const graphKey = identity?.complete === true ? `${identity.graphId}:${identity.snapshotDigest}` : ''
  const workflowId = typeof trace?.workflowManifest?.value.id === 'string' ? trace.workflowManifest.value.id : ''
  const [state, setState] = useState<{ key: string; data?: MissionCodebaseIndex; error?: string }>({ key: '' })
  const key = `${workflowId}:${graphKey}`
  useEffect(() => {
    let active = true
    let request = pending.get(key)
    if (!request) {
      request = (async () => {
        const owner = await import('@/features/agent-graph/agentGraphWorkspaceIndex')
        let snapshotPath: string | undefined
        // Upgrade an already-retained native graph without ingesting its source again.
        if (graphKey) {
          const graph = useGraphStore.getState().graphData
          const current = graph?.metadata?.agentGraphProjection as Record<string, unknown> | undefined
          if (graph && `${current?.graphId}:${current?.snapshotDigest}` === graphKey) {
            const { retainAgentGraphWorkspaceProjection } = await import('@/features/agent-graph/agentGraphWorkspaceArtifact')
            snapshotPath = await owner.retainAgentGraphWorkspaceIndex(graph, await retainAgentGraphWorkspaceProjection(graph), { activate: false })
          }
        }
        const index = await owner.readActiveAgentGraphWorkspaceIndex(snapshotPath)
        const reference = index && workflowId ? await owner.bindAgentGraphWorkspaceIndex(workflowId, index) : undefined
        return index ? { index, reference } : undefined
      })()
      pending.set(key, request)
      void request.finally(() => { if (pending.get(key) === request) pending.delete(key) }).catch(() => undefined)
    }
    void request.then(data => { if (active) setState({ key, data }) })
      .catch(() => { if (active) setState({ key, error: 'Codebase index unavailable. Reopen its retained native graph to inspect the source identity.' }) })
    return () => { active = false }
  }, [key, graphKey, workflowId])
  return state.key === key ? state : { key }
}
