import type { FlowConfig } from '@/components/FlowCanvas/config'
import { buildFlowLayoutTopologyKey } from '@/components/FlowCanvas/flowLayoutTopologyKey'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { GraphData } from '@/lib/graph/types'

export const buildFlowGroupSceneKey = (groups: ReadonlyArray<GraphGroup> | null | undefined): string =>
  JSON.stringify((groups || []).map(group => ({
    id: String(group.id || ''),
    parentGroupId: String(group.parentGroupId || ''),
    autoBounds: group.autoBounds === true,
    memberNodeIds: Array.isArray(group.memberNodeIds) ? group.memberNodeIds.map(String) : [],
    bounds: group.bounds || null,
    style: group.style || null,
  })))

export const hasFlowGroupSceneChanged = (
  previous: ReadonlyArray<GraphGroup> | null | undefined,
  next: ReadonlyArray<GraphGroup> | null | undefined,
): boolean => buildFlowGroupSceneKey(previous) !== buildFlowGroupSceneKey(next)

export function buildFlowCanvasNativeSceneKey(args: {
  sceneGraphData: GraphData | null
  layoutVariant: string
  rankdir: 'TB' | 'LR'
  flowConfig: FlowConfig
  forbidCircleNodes: boolean
  sceneGroups: GraphGroup[]
}): string {
  const nodes = Array.isArray(args.sceneGraphData?.nodes) ? args.sceneGraphData.nodes : []
  const edges = Array.isArray(args.sceneGraphData?.edges) ? args.sceneGraphData.edges : []
  const topologyKey = buildFlowLayoutTopologyKey({
    semanticGraphKey: buildGraphMetaKeyIgnoringPending(args.sceneGraphData),
    nodes,
    edges,
  })
  const nativeSceneKey = [
    topologyKey,
    `layout=${args.layoutVariant}`,
    `rankdir=${args.rankdir}`,
    `node=${Math.round(args.flowConfig.node.widthPx)}x${Math.round(args.flowConfig.node.heightPx)}`,
    `forbidCircle=${args.forbidCircleNodes ? 1 : 0}`,
    `groups=${buildFlowGroupSceneKey(args.sceneGroups)}`,
  ].join('|')
  return buildScopedGraphSemanticKey('flow-canvas-native-scene', { graphSemanticKey: nativeSceneKey })
}
