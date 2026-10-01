import { useLayoutEffect, useSyncExternalStore } from 'react'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'
import type { DocumentSignalIndex, DocumentSignalKind } from '@/lib/websites/signalTokens'
import type { GraphData } from '@/lib/graph/types'
import { hashText } from '@/features/parsers/hash'

export type DocumentInsightsSource = {
  key: string
  text: string
  signals: DocumentSignalIndex | null
  revealLine: (line: number) => void
}
type InsightsSnapshot = { source: DocumentInsightsSource | null; kind: DocumentSignalKind | null; request: number }
let snapshot: InsightsSnapshot = { source: null, kind: null, request: 0 }
const listeners = new Set<() => void>()
const publish = (next: InsightsSnapshot) => { snapshot = next; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const readDocumentInsights = () => snapshot
export const isCurrentDocumentInsightsSource = (source: DocumentInsightsSource): boolean => snapshot.source === source
export const useDocumentInsights = () => useSyncExternalStore(subscribe, readDocumentInsights, readDocumentInsights)

export function registerDocumentInsightsSource(source: DocumentInsightsSource): () => void {
  publish({ ...snapshot, source })
  return () => { if (snapshot.source === source) publish({ ...snapshot, source: null }) }
}

export function useDocumentInsightsSource(source: DocumentInsightsSource) {
  useLayoutEffect(() => registerDocumentInsightsSource(source), [source.key, source.text, source.signals, source.revealLine])
}

export function openDocumentInsights(kind: DocumentSignalKind) {
  publish({ ...snapshot, kind, request: snapshot.request + 1 })
  emitFloatingPanelOpen({ tab: 'preview', open: true })
}

export function jumpToDocumentInsight(source: DocumentInsightsSource, line: number): boolean {
  if (!isCurrentDocumentInsightsSource(source) || !source.signals || !Number.isInteger(line) || line < 1 || line > source.signals.scannedLines) return false
  source.revealLine(line)
  return true
}

/** Explicit layer action only; merge against the current graph, retaining all authored elements. */
export function applyDocumentPassageLayer(source: DocumentInsightsSource, derived: GraphData | null, target: { graphData: GraphData | null; setGraphData: (graph: GraphData) => void }): boolean {
  if (!isCurrentDocumentInsightsSource(source)) return false
  const graph = target.graphData
  if (!graph || ![source.key, `markdown:${source.key}`].includes(String(graph.metadata?.source ?? ''))) return false
  if (derived && (derived.context !== 'document-passages' || derived.metadata?.source !== source.key)) return false
  const analysis = derived?.metadata?.passageAnalysis
  if (derived && (!analysis || typeof analysis !== 'object' || Array.isArray(analysis) || analysis.revision !== hashText(source.text))) return false
  const isLayer = (item: { metadata?: Record<string, unknown> }) => item.metadata?.kind === 'document-passage' && item.metadata?.source === source.key && item.metadata?.derived === true
  const retainedNodes = graph.nodes.filter(node => !isLayer(node))
  const retainedIds = new Set(retainedNodes.map(node => node.id))
  const retainedEdges = graph.edges.filter(edge => !isLayer(edge))
  // User-created edges into a layer are an explicit dependency, never silently deleted.
  if (retainedEdges.some(edge => !retainedIds.has(edge.source) || !retainedIds.has(edge.target))) return false
  if (derived?.nodes.some(node => retainedIds.has(node.id))) return false
  const edges = [...retainedEdges, ...(derived?.edges ?? [])]
  if (new Set(edges.map(edge => edge.id)).size !== edges.length) return false
  target.setGraphData({ ...graph, nodes: [...retainedNodes, ...(derived?.nodes ?? [])], edges })
  return true
}
