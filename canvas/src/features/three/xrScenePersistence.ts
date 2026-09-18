import { useGraphStore } from '@/hooks/useGraphStore'
import { serializeXrMotionReferencePlan, XR_MOTION_REFERENCE_GRAPH_METADATA_KEY } from './xrMotionReferenceModel'
import { markXrMotionReferenceSaved, readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { XR_PHYSICS_GRAPH_METADATA_KEY } from './xrPhysicsModel'
import { markXrPhysicsRuntimeSaved, serializeXrPhysicsRuntimeWorld } from './xrPhysicsRuntime'
import type { JSONValue } from '@/lib/graph/types'

/** Existing graph metadata flow owns Markdown, Source Files and local workspace writes; existing sync owns publication. */
export function persistXrScene(includePhysics = false): boolean {
  const state = useGraphStore.getState()
  if (!state.graphData) return false
  const serializedMotion = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
  const serializedPhysics = serializeXrPhysicsRuntimeWorld() as unknown as JSONValue
  state.updateGraphMetadata({
    [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializedMotion,
    ...(includePhysics ? { [XR_PHYSICS_GRAPH_METADATA_KEY]: serializedPhysics } : {}),
  })
  const metadata = useGraphStore.getState().graphData?.metadata
  if (metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY] !== serializedMotion) return false
  if (includePhysics && JSON.stringify(metadata?.[XR_PHYSICS_GRAPH_METADATA_KEY]) !== JSON.stringify(serializedPhysics)) return false
  markXrMotionReferenceSaved(serializedMotion)
  if (includePhysics) markXrPhysicsRuntimeSaved(metadata?.[XR_PHYSICS_GRAPH_METADATA_KEY])
  return true
}
