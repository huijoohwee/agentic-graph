import type { GraphData } from '@/lib/graph/types'
import type { GetGraph } from './graphDataSliceAccess'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { buildCanonicalNodeLookup, canonicalNodeIdSetHas, parseCanonicalNodeIds } from '@/lib/graph/canonicalNodeIds'
import {
  shouldPreserveFrontmatterAutoManagedBalancedCollective,
  stripFrontmatterAutoManagedWidgetPinnedStates,
  stripFrontmatterAutoManagedWidgetWorldPositions,
  stripFrontmatterAutoManagedWidgetScreenPositions,
} from '@/lib/storyboardWidget/widgetPlacementAuthority'

import { buildWidgetLayoutEvidence, compareWidgetLayoutEvidence, type WidgetLayoutEvidence } from './graphDataRetainedPlacementContinuity'

type WidgetCommitState = Pick<ReturnType<GetGraph>,
  | 'graphData' | 'flowWidgetLayoutEvidenceByGraphMetaKey'
  | 'flowWidgetPinnedByNodeId' | 'flowWidgetPinnedByNodeIdByGraphMetaKey'
  | 'flowWidgetPosByNodeId' | 'flowWidgetPosByNodeIdByGraphMetaKey'
  | 'flowWidgetWorldPosByNodeId' | 'flowWidgetWorldPosByNodeIdByGraphMetaKey'
>
type WidgetCommitPatch = Partial<Omit<WidgetCommitState, 'graphData'>>

function getCanonicalLookupValue<T>(lookup: ReadonlyMap<string, T>, rawId: unknown): T | undefined {
  const candidateIds = parseCanonicalNodeIds(rawId)
  for (let i = 0; i < candidateIds.length; i += 1) {
    const candidateId = String(candidateIds[i] || '').trim()
    if (!candidateId || !lookup.has(candidateId)) continue
    return lookup.get(candidateId)
  }
  return undefined
}

function remapNodeKeyedRecordByCanonicalNodeId<T>(
  graphData: GraphData | null | undefined,
  valueByNodeId: Record<string, T>,
  allowedCanonicalNodeIds?: ReadonlySet<string> | null,
): Record<string, T> {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const entries = Object.entries(valueByNodeId || {}).filter(([rawId]) => String(rawId || '').trim().length > 0)
  if (entries.length === 0) return valueByNodeId
  if (nodes.length === 0) return {}
  const lookup = buildCanonicalNodeLookup(entries.map(([rawId, value]) => [rawId, value] as const))
  const next: Record<string, T> = {}
  for (let i = 0; i < nodes.length; i += 1) {
    const rawId = String(nodes[i]?.id || '').trim()
    if (!rawId) continue
    if (allowedCanonicalNodeIds && !canonicalNodeIdSetHas(allowedCanonicalNodeIds, rawId)) continue
    const value = getCanonicalLookupValue(lookup, rawId)
    if (typeof value === 'undefined') continue
    next[rawId] = value
  }
  const prevKeys = Object.keys(valueByNodeId || {})
  const nextKeys = Object.keys(next)
  if (prevKeys.length === nextKeys.length) {
    let unchanged = true
    for (let i = 0; i < nextKeys.length; i += 1) {
      const key = nextKeys[i]
      if (!(key in (valueByNodeId || {})) || valueByNodeId[key] !== next[key]) {
        unchanged = false
        break
      }
    }
    if (unchanged) return valueByNodeId
  }
  return next
}

function isSameFlowWidgetScreenPosByNodeId(
  a: Record<string, { top: number; left: number }>,
  b: Record<string, { top: number; left: number }>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    const av = a[key]
    const bv = b[key]
    if (!av || !bv) return false
    if (av.top !== bv.top || av.left !== bv.left) return false
  }
  return true
}

function isSameFlowWidgetWorldPosByNodeId(
  a: Record<string, { x: number; y: number }>,
  b: Record<string, { x: number; y: number }>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    const av = a[key]
    const bv = b[key]
    if (!av || !bv) return false
    if (av.x !== bv.x || av.y !== bv.y) return false
  }
  return true
}

function resolveCommittedFlowWidgetScreenPositions(args: {
  graphData: GraphData
  posByNodeId: Record<string, { top: number; left: number }>
  pinnedByNodeId?: Record<string, boolean>
  preserveStableSameSourceOverlayState: boolean
}): Record<string, { top: number; left: number }> {
  return stripFrontmatterAutoManagedWidgetScreenPositions({
    graphData: args.graphData,
    posByNodeId: args.posByNodeId,
    pinnedByNodeId: args.pinnedByNodeId,
    preserveBalancedCollective: args.preserveStableSameSourceOverlayState,
    preserveStableSameSourceOverlayState: args.preserveStableSameSourceOverlayState,
  })
}

export type WidgetDocumentPlacement = {
  layout: WidgetLayoutEvidence
  pinned: Record<string, boolean>
  pos: Record<string, { top: number; left: number }>
  world: Record<string, { x: number; y: number }>
}

export function reconcileWidgetDocumentPlacement(
  graphData: GraphData,
  previous: WidgetDocumentPlacement | null,
): WidgetDocumentPlacement | null {
  const layout = buildWidgetLayoutEvidence(graphData)
  if (!layout) return null
  const continuity = previous ? compareWidgetLayoutEvidence(previous.layout, layout) : null
  const preserveBalanced = continuity?.stableTopology === true && continuity.stableTypes
    && shouldPreserveFrontmatterAutoManagedBalancedCollective({
      graphData, posByNodeId: previous!.pos, pinnedByNodeId: previous!.pinned,
    })
  const carry = continuity?.stableLayout === true || preserveBalanced
  const replaceNodeSet = continuity?.nodeSetChanged === true
  const select = <T>(values: Record<string, T>): Record<string, T> => {
    if (replaceNodeSet) return remapNodeKeyedRecordByCanonicalNodeId(graphData, values, continuity!.stableCanonicalNodeIds)
    return carry ? remapNodeKeyedRecordByCanonicalNodeId(graphData, values) : {}
  }
  const pinned = stripFrontmatterAutoManagedWidgetPinnedStates({ graphData, pinnedByNodeId: select(previous?.pinned || {}) })
  const posRaw = select(previous?.pos || {})
  const pos = replaceNodeSet ? posRaw : resolveCommittedFlowWidgetScreenPositions({
    graphData, posByNodeId: posRaw, pinnedByNodeId: pinned, preserveStableSameSourceOverlayState: carry,
  })
  const worldRaw = select(previous?.world || {})
  const world = carry || replaceNodeSet ? worldRaw : stripFrontmatterAutoManagedWidgetWorldPositions({ graphData, worldPosByNodeId: worldRaw })
  return { layout, pinned, pos, world }
}

export function buildCommittedFlowWidgetState(args: {
  state: WidgetCommitState
  graphData: GraphData
  workspaceGraphMutationBlocked: boolean
}): WidgetCommitPatch {
  if (args.workspaceGraphMutationBlocked) return {}
  const { state, graphData } = args
  const graphKey = buildGraphDocumentMetaKey(graphData)
  if (!graphKey) return { flowWidgetPinnedByNodeId: {}, flowWidgetPosByNodeId: {}, flowWidgetWorldPosByNodeId: {} }
  const pinnedByKey = state.flowWidgetPinnedByNodeIdByGraphMetaKey || {}
  const posByKey = state.flowWidgetPosByNodeIdByGraphMetaKey || {}
  const worldByKey = state.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}
  const evidenceByKey = state.flowWidgetLayoutEvidenceByGraphMetaKey || {}
  const evidence = evidenceByKey[graphKey]
  const previous = evidence ? {
    layout: evidence, pinned: pinnedByKey[graphKey] || {}, pos: posByKey[graphKey] || {}, world: worldByKey[graphKey] || {},
  } : null
  // Pending graph placeholders never replace the last ready layout evidence.
  if (graphData.metadata?.pending === true) return {
    flowWidgetPinnedByNodeId: previous?.pinned || {},
    flowWidgetPosByNodeId: previous?.pos || {},
    flowWidgetWorldPosByNodeId: previous?.world || {},
  }
  const next = reconcileWidgetDocumentPlacement(graphData, previous)
  const pinned = next?.pinned || {}, pos = next?.pos || {}, world = next?.world || {}
  return {
    flowWidgetPinnedByNodeId: pinned,
    flowWidgetPinnedByNodeIdByGraphMetaKey: pinnedByKey[graphKey] === pinned ? pinnedByKey : { ...pinnedByKey, [graphKey]: pinned },
    flowWidgetPosByNodeId: pos,
    flowWidgetPosByNodeIdByGraphMetaKey: Object.prototype.hasOwnProperty.call(posByKey, graphKey)
      && isSameFlowWidgetScreenPosByNodeId(posByKey[graphKey] || {}, pos) ? posByKey : { ...posByKey, [graphKey]: pos },
    flowWidgetWorldPosByNodeId: world,
    flowWidgetWorldPosByNodeIdByGraphMetaKey: Object.prototype.hasOwnProperty.call(worldByKey, graphKey)
      && isSameFlowWidgetWorldPosByNodeId(worldByKey[graphKey] || {}, world) ? worldByKey : { ...worldByKey, [graphKey]: world },
    flowWidgetLayoutEvidenceByGraphMetaKey: { ...evidenceByKey, [graphKey]: next?.layout || null },
  }
}
