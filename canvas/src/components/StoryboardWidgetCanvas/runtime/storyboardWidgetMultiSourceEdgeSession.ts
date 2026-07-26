import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import type { GraphData } from '@/lib/graph/types'

export function normalizeStoryboardWidgetPendingSourceIds(
  sourceNodeIds: ReadonlyArray<string> | null | undefined,
  primarySourceNodeId: unknown,
): string[] {
  const primarySourceId = String(primarySourceNodeId || '').trim()
  const normalized = new Set<string>()
  if (primarySourceId) normalized.add(primarySourceId)
  for (const rawSourceNodeId of sourceNodeIds || []) {
    const sourceNodeId = String(rawSourceNodeId || '').trim()
    if (sourceNodeId) normalized.add(sourceNodeId)
  }
  return Array.from(normalized)
}

export function resolveStoryboardWidgetMultiSourceIds(args: {
  graphData: GraphData | null | undefined
  selectedNodeIds: ReadonlyArray<string> | null | undefined
  primarySourceNodeId: unknown
  targetNodeId?: unknown
}): string[] {
  const graphData = args.graphData || null
  const primarySourceId = String(
    resolveGraphNodeByCanonicalId(graphData, args.primarySourceNodeId)?.id || '',
  ).trim()
  if (!primarySourceId) return []
  const selectedSourceIds = (args.selectedNodeIds || [])
    .map(rawId => String(resolveGraphNodeByCanonicalId(graphData, rawId)?.id || '').trim())
    .filter(Boolean)
  if (!selectedSourceIds.includes(primarySourceId)) return [primarySourceId]
  const targetNodeId = String(
    resolveGraphNodeByCanonicalId(graphData, args.targetNodeId)?.id || '',
  ).trim()
  return normalizeStoryboardWidgetPendingSourceIds(selectedSourceIds, primarySourceId)
    .filter(sourceNodeId => sourceNodeId !== targetNodeId)
}
