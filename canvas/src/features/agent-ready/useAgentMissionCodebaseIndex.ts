import { useEffect, useState } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { WorkspaceCodebaseIndex } from '@/features/agent-graph/agentGraphWorkspaceIndex'
import type { RunTrace } from './missionControlProjection'
import { readAgentRunInspectionSnapshot } from './agentRunInspectionStore'

export type MissionCodebaseIndex = { index: WorkspaceCodebaseIndex; reference?: { path: string; value: Record<string, unknown> } }
const pending = new Map<string, Promise<MissionCodebaseIndex | undefined>>()
const latestByWorkflow = new Map<string, string>()

function selection(trace: RunTrace | null | undefined, identity: Record<string, unknown> | undefined) {
  const nativeReference = (trace?.workflowManifest?.value.codebaseIndex as Record<string, unknown> | undefined)?.snapshot as Record<string, unknown> | undefined
  const nativeDigest = trace?.workspaceObservation && typeof nativeReference?.digest === 'string' ? nativeReference.digest : ''
  const manifestDigest = trace?.workspaceObservation?.manifestDigest ?? ''
  const graphKey = !nativeDigest && identity?.complete === true ? `${identity.graphId}:${identity.snapshotDigest}` : ''
  const workflowId = typeof trace?.workflowManifest?.value.id === 'string' ? trace.workflowManifest.value.id : ''
  const currentInspection = readAgentRunInspectionSnapshot()
  const scope = currentInspection && currentInspection.trace === trace ? currentInspection.scope : ''
  const ownerKey = workflowId
  const key = JSON.stringify([scope, trace?.workspaceObservation?.manifestPath ?? '', workflowId,
    trace?.workflowManifest?.digest ?? '', manifestDigest, nativeDigest, graphKey])
  return { nativeDigest, manifestDigest, graphKey, workflowId, ownerKey, key, scope }
}

/** One retained index reader for live Mission and explicit historical checkpoints. */
export function readAgentMissionCodebaseIndex(trace?: RunTrace | null): Promise<MissionCodebaseIndex | undefined> {
  const identity = useGraphStore.getState().graphData?.metadata?.agentGraphProjection as Record<string, unknown> | undefined
  const { nativeDigest, manifestDigest, graphKey, workflowId, ownerKey, key, scope } = selection(trace, identity)
  if (!trace && !graphKey) return Promise.resolve(undefined)
  if (ownerKey) latestByWorkflow.set(ownerKey, key)
  const current = () => {
    if (ownerKey && latestByWorkflow.get(ownerKey) !== key) return false
    if (!scope) return true
    const inspection = readAgentRunInspectionSnapshot()
    return inspection?.trace === trace && inspection.scope === scope && inspection.expiresAt > Date.now()
  }
  const assertCurrent = () => { if (!current()) throw Error('Native index selection changed') }
  let request = scope ? pending.get(key) : undefined
  if (!request) {
      request = (async () => {
        const owner = await import('@/features/agent-graph/agentGraphWorkspaceIndex')
        let snapshotPath: string | undefined
        if (nativeDigest) {
          const response = await fetch('/api/agent-swarm/workspace-codebase', { method: 'POST',
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifestDigest }),
            signal: AbortSignal.timeout(30000) })
          if (!response.ok || !response.headers.get('cache-control')?.includes('no-store')) throw Error('Native index unavailable')
          const text = await response.text()
          if (new TextEncoder().encode(text).length > 524288) throw Error('Native index exceeds its transport bound')
          const result = JSON.parse(text)
          if (result.manifestDigest !== manifestDigest || result.indexDigest !== nativeDigest) throw Error('Native index selection changed')
          assertCurrent()
          const { buildAgentGraphCanvasProjection } = await import('@/features/agent-graph/agentGraphCanvasProjection')
          const { retainAgentGraphWorkspaceProjection } = await import('@/features/agent-graph/agentGraphWorkspaceArtifact')
          const graph = buildAgentGraphCanvasProjection({ ...result.result, handled: true, kind: 'agent-graph' })
          assertCurrent()
          snapshotPath = await owner.retainAgentGraphWorkspaceIndex(graph, await retainAgentGraphWorkspaceProjection(graph), { activate: false })
        }
        // Upgrade an already-retained native graph without ingesting its source again.
        else if (graphKey) {
          const graph = useGraphStore.getState().graphData
          const current = graph?.metadata?.agentGraphProjection as Record<string, unknown> | undefined
          if (graph && `${current?.graphId}:${current?.snapshotDigest}` === graphKey) {
            assertCurrent()
            const { retainAgentGraphWorkspaceProjection } = await import('@/features/agent-graph/agentGraphWorkspaceArtifact')
            snapshotPath = await owner.retainAgentGraphWorkspaceIndex(graph, await retainAgentGraphWorkspaceProjection(graph), { activate: false })
          }
        }
        assertCurrent()
        const index = await owner.readActiveAgentGraphWorkspaceIndex(snapshotPath)
        assertCurrent()
        const reference = index && workflowId ? await owner.bindAgentGraphWorkspaceIndex(workflowId, index, { isCurrent: current }) : undefined
        return index ? { index, reference } : undefined
      })()
      if (scope) pending.set(key, request)
      void request.finally(() => {
        if (pending.get(key) === request) pending.delete(key)
        if (ownerKey && latestByWorkflow.get(ownerKey) === key) latestByWorkflow.delete(ownerKey)
      }).catch(() => undefined)
    }
  return request
}

/** Discover retained native indexes on demand; saved reports never enter this reader. */
export function useAgentMissionCodebaseIndex(trace?: RunTrace | null, enabled = true) {
  const identity = useGraphStore(state => state.graphData?.metadata?.agentGraphProjection) as Record<string, unknown> | undefined
  const [state, setState] = useState<{ key: string; data?: MissionCodebaseIndex; error?: string }>({ key: '' })
  const { key } = selection(trace, identity)
  useEffect(() => {
    if (!enabled) return
    let active = true
    const request = readAgentMissionCodebaseIndex(trace)
    void request.then(data => { if (active) setState({ key, data }) })
      .catch(() => { if (active) setState({ key, error: 'Codebase index unavailable. Reopen its retained native graph to inspect the source identity.' }) })
    return () => { active = false }
  }, [key, enabled])
  return enabled && state.key === key ? state : { key }
}
