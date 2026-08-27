import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { createUniqueId } from '@/lib/ids'
import {
  buildCanonicalNodeIdSet,
  isCanonicalNodeIdEqual,
  resolveGraphNodeByCanonicalId,
} from '@/lib/graph/canonicalNodeIds'
import {
  readGraphNodeProperties,
  type GraphNodeCardTextFieldId,
} from '@/lib/cards/graphNodeCardFields'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import {
  FLOW_DEFAULT_SOURCE_PORT_KEY,
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
  readFlowEdgePortKey,
} from '@/lib/graph/flowPorts'

export const TEXT_SELECTION_WIDGET_LINK_SCHEMA = 'agenticgraph-text-selection-widget-link/v1'
export const TEXT_SELECTION_WIDGET_CREATE_EVENT = 'agenticgraph:text-selection-widget-create'
export const TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY = FLOW_DEFAULT_SOURCE_PORT_KEY
export const TEXT_SELECTION_WIDGET_TARGET_PORT_KEY = 'selection' as const

export type TextSelectionWidgetLinkSession = {
  sourceNodeId: string
  selectedText: string
  startLine: number
  endLine: number
  documentPath: string
  createdAt: string
}

export type TextSelectionWidgetTarget = {
  registryEntryId: string
  nodeTypeId: string
  widgetTypeId: string
  formId: string
  layoutVariantId?: string
}

export type TextSelectionWidgetCreateDetail = {
  session: TextSelectionWidgetLinkSession
  target: TextSelectionWidgetTarget
  claimed: boolean
}

export type TextSelectionWidgetEdgeProvenance = {
  selectedText: string
  startLine: number
  endLine: number
  documentPath: string
  createdAt: string
  targetFieldId: GraphNodeCardTextFieldId
}

export type TextSelectionWidgetSourceHighlight = TextSelectionWidgetEdgeProvenance & {
  edgeId: string
  sourceNodeId: string
  targetNodeId: string
  sourcePortKey: string
  targetPortKey: string
}

const listeners = new Set<() => void>()
let activeSession: TextSelectionWidgetLinkSession | null = null

function notify(): void {
  listeners.forEach(listener => listener())
}

function normalizeLine(value: unknown, fallback: number): number {
  const parsed = Number(unwrapGraphCellValue(value))
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback
}

function readTextSelectionWidgetEdgeProperty(
  edge: GraphEdge | null | undefined,
  key: string,
): unknown {
  const properties = unwrapGraphCellValue(edge?.properties)
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return undefined
  return unwrapGraphCellValue((properties as Record<string, unknown>)[key])
}

function resolveTextSelectionWidgetTargetFieldId(
  targetNode: GraphNode | null | undefined,
): GraphNodeCardTextFieldId {
  const properties = readGraphNodeProperties(targetNode)
  const cardType = String(
    properties.cardTypeLabel
    || properties.probeTreeTypeLabel
    || properties.probeTreeCardVariant
    || properties.typeLabel
    || '',
  ).trim().toLowerCase()
  return cardType.includes('probe-tree') || properties.probeTreeMultiSelect === true
    ? 'summary'
    : 'prompt'
}

export function readTextSelectionWidgetEdgeProvenance(
  edge: GraphEdge | null | undefined,
): TextSelectionWidgetEdgeProvenance | null {
  if (String(readTextSelectionWidgetEdgeProperty(edge, 'schema') || '').trim() !== TEXT_SELECTION_WIDGET_LINK_SCHEMA) return null
  const selectedText = String(readTextSelectionWidgetEdgeProperty(edge, 'selection:text') || '').trim()
  if (!selectedText) return null
  const startLine = normalizeLine(readTextSelectionWidgetEdgeProperty(edge, 'selection:startLine'), 1)
  const endLine = Math.max(startLine, normalizeLine(readTextSelectionWidgetEdgeProperty(edge, 'selection:endLine'), startLine))
  const targetFieldRaw = String(readTextSelectionWidgetEdgeProperty(edge, 'selection:targetFieldId') || '').trim()
  const targetFieldId: GraphNodeCardTextFieldId = (
    targetFieldRaw === 'summary'
    || targetFieldRaw === 'output'
    || targetFieldRaw === 'action'
    || targetFieldRaw === 'dialogue'
    || targetFieldRaw === 'prompt'
    || targetFieldRaw === 'style'
  ) ? targetFieldRaw : 'prompt'
  return {
    selectedText,
    startLine,
    endLine,
    documentPath: String(readTextSelectionWidgetEdgeProperty(edge, 'selection:documentPath') || '').trim(),
    createdAt: String(readTextSelectionWidgetEdgeProperty(edge, 'selection:createdAt') || '').trim(),
    targetFieldId,
  }
}

export function buildTextSelectionWidgetEdgePersistenceProperties(
  edge: GraphEdge | null | undefined,
): Record<string, JSONValue> | null {
  const provenance = readTextSelectionWidgetEdgeProvenance(edge)
  if (!provenance) return null
  const sourcePortKey = readFlowEdgePortKey(edge, 'source') || TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY
  const targetPortKey = readFlowEdgePortKey(edge, 'target') || TEXT_SELECTION_WIDGET_TARGET_PORT_KEY
  return {
    schema: TEXT_SELECTION_WIDGET_LINK_SCHEMA,
    [FLOW_EDGE_SOURCE_PORT_KEY]: sourcePortKey,
    [FLOW_EDGE_TARGET_PORT_KEY]: targetPortKey,
    'selection:text': provenance.selectedText,
    'selection:startLine': provenance.startLine,
    'selection:endLine': provenance.endLine,
    'selection:createdAt': provenance.createdAt,
    'selection:targetFieldId': provenance.targetFieldId,
    ...(provenance.documentPath
      ? { 'selection:documentPath': provenance.documentPath }
      : {}),
  }
}

export function readTextSelectionWidgetSourceHighlights(args: {
  graphData: GraphData | null | undefined
  sourceNodeId: unknown
}): TextSelectionWidgetSourceHighlight[] {
  const graphData = args.graphData
  const requestedSource = resolveGraphNodeByCanonicalId(graphData, args.sourceNodeId)
  if (!graphData || !requestedSource) return []
  const highlights: TextSelectionWidgetSourceHighlight[] = []
  for (const edge of graphData.edges || []) {
    const provenance = readTextSelectionWidgetEdgeProvenance(edge)
    if (!provenance) continue
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    const source = resolveGraphNodeByCanonicalId(graphData, src)
    const target = resolveGraphNodeByCanonicalId(graphData, tgt)
    if (!source || !target || !isCanonicalNodeIdEqual(source.id, requestedSource.id)) continue
    const edgeId = String(edge.id || '').trim()
    if (!edgeId) continue
    highlights.push({
      ...provenance,
      edgeId,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      sourcePortKey: readFlowEdgePortKey(edge, 'source') || TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY,
      targetPortKey: readFlowEdgePortKey(edge, 'target') || TEXT_SELECTION_WIDGET_TARGET_PORT_KEY,
    })
  }
  return highlights.sort((a, b) => a.edgeId.localeCompare(b.edgeId))
}

export function hasOutgoingTextSelectionWidgetEdge(args: {
  graphData: GraphData | null | undefined
  sourceNodeId: unknown
}): boolean {
  return readTextSelectionWidgetSourceHighlights(args).length > 0
}

export function beginTextSelectionWidgetLinkSession(
  input: Omit<TextSelectionWidgetLinkSession, 'createdAt'>,
): TextSelectionWidgetLinkSession | null {
  const sourceNodeId = String(input.sourceNodeId || '').trim()
  const selectedText = String(input.selectedText || '').trim()
  if (!sourceNodeId || !selectedText) return null
  const startLine = normalizeLine(input.startLine, 1)
  activeSession = {
    sourceNodeId,
    selectedText,
    startLine,
    endLine: Math.max(startLine, normalizeLine(input.endLine, startLine)),
    documentPath: String(input.documentPath || '').trim(),
    createdAt: new Date().toISOString(),
  }
  notify()
  return activeSession
}

export function clearTextSelectionWidgetLinkSession(): void {
  if (!activeSession) return
  activeSession = null
  notify()
}

export function clearTextSelectionWidgetLinkSessionIfCurrent(
  expectedSession: TextSelectionWidgetLinkSession,
): void {
  if (activeSession !== expectedSession) return
  clearTextSelectionWidgetLinkSession()
}

export function getTextSelectionWidgetLinkSnapshot(): TextSelectionWidgetLinkSession | null {
  return activeSession
}

export function subscribeTextSelectionWidgetLink(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function dispatchTextSelectionWidgetCreate(target: TextSelectionWidgetTarget): boolean {
  if (typeof window === 'undefined' || !activeSession) return false
  const detail: TextSelectionWidgetCreateDetail = {
    session: activeSession,
    target,
    claimed: false,
  }
  window.dispatchEvent(new window.CustomEvent<TextSelectionWidgetCreateDetail>(
    TEXT_SELECTION_WIDGET_CREATE_EVENT,
    { detail },
  ))
  return detail.claimed
}

export function resolveTextSelectionWidgetTargetPosition(args: {
  sourceNode: GraphNode
  fallbackGap?: number
}): { x: number; y: number } {
  const source = args.sourceNode
  const properties = source.properties && typeof source.properties === 'object'
    ? source.properties as Record<string, unknown>
    : {}
  const widthCandidates = [
    properties['visual:width'],
    properties.width,
    properties.panelWidth,
  ]
  const width = widthCandidates
    .map(Number)
    .find(candidate => Number.isFinite(candidate) && candidate > 0)
  const gap = Number.isFinite(args.fallbackGap) ? Math.max(80, Number(args.fallbackGap)) : 560
  return {
    x: (Number.isFinite(source.x) ? Number(source.x) : 0) + Math.max(gap, (width || 0) + 120),
    y: Number.isFinite(source.y) ? Number(source.y) : 0,
  }
}

export function buildTextSelectionWidgetEdge(args: {
  graphData: GraphData
  session: TextSelectionWidgetLinkSession
  targetNodeId: string
}): GraphEdge | null {
  const sourceNodeId = String(
    resolveGraphNodeByCanonicalId(args.graphData, args.session.sourceNodeId)?.id || '',
  ).trim()
  const targetNodeId = String(
    resolveGraphNodeByCanonicalId(args.graphData, args.targetNodeId)?.id || '',
  ).trim()
  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return null
  const duplicate = (args.graphData.edges || []).find(edge => (
    isCanonicalNodeIdEqual(edge.source, sourceNodeId)
    && isCanonicalNodeIdEqual(edge.target, targetNodeId)
    && String(edge.properties?.schema || '').trim() === TEXT_SELECTION_WIDGET_LINK_SCHEMA
    && String(edge.properties?.['selection:text'] || '').trim() === args.session.selectedText
  ))
  if (duplicate) return duplicate
  const edgeIds = buildCanonicalNodeIdSet(
    (args.graphData.edges || []).map(edge => edge.id),
  )
  const properties: Record<string, JSONValue> = {
    schema: TEXT_SELECTION_WIDGET_LINK_SCHEMA,
    [FLOW_EDGE_SOURCE_PORT_KEY]: TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY,
    [FLOW_EDGE_TARGET_PORT_KEY]: TEXT_SELECTION_WIDGET_TARGET_PORT_KEY,
    'selection:text': args.session.selectedText,
    'selection:startLine': args.session.startLine,
    'selection:endLine': args.session.endLine,
    'selection:createdAt': args.session.createdAt,
    'selection:targetFieldId': resolveTextSelectionWidgetTargetFieldId(
      resolveGraphNodeByCanonicalId(args.graphData, targetNodeId),
    ),
  }
  if (args.session.documentPath) properties['selection:documentPath'] = args.session.documentPath
  return {
    id: createUniqueId('e', edgeIds),
    source: sourceNodeId,
    target: targetNodeId,
    label: 'selection',
    properties,
  }
}

export function isTextSelectionWidgetEdgePersisted(args: {
  graphData: GraphData | null | undefined
  edge: GraphEdge
}): boolean {
  return (args.graphData?.edges || []).some(candidate => (
    isCanonicalNodeIdEqual(candidate.id, args.edge.id)
    && isCanonicalNodeIdEqual(candidate.source, args.edge.source)
    && isCanonicalNodeIdEqual(candidate.target, args.edge.target)
  ) || (
    isCanonicalNodeIdEqual(candidate.source, args.edge.source)
    && isCanonicalNodeIdEqual(candidate.target, args.edge.target)
    && String(candidate.properties?.schema || '').trim() === TEXT_SELECTION_WIDGET_LINK_SCHEMA
    && String(candidate.properties?.['selection:text'] || '').trim()
      === String(args.edge.properties?.['selection:text'] || '').trim()
  ))
}

export type TextSelectionWidgetEdgePersistenceResult =
  | { kind: 'persisted'; edge: GraphEdge }
  | { kind: 'unresolved' }
  | { kind: 'rejected'; edge: GraphEdge }

export async function persistTextSelectionWidgetEdgeAfterTargetCreation(args: {
  readGraphDataCandidates: () => ReadonlyArray<GraphData | null | undefined>
  session: TextSelectionWidgetLinkSession
  targetNodeId: string
  addEdge: (edge: GraphEdge) => void
  waitForGraphMutation: () => Promise<void>
  maxAttempts?: number
}): Promise<TextSelectionWidgetEdgePersistenceResult> {
  const maxAttempts = Number.isFinite(args.maxAttempts)
    ? Math.min(8, Math.max(1, Math.floor(Number(args.maxAttempts))))
    : 4
  let resolvedEdge: GraphEdge | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidates = args.readGraphDataCandidates().filter(
      (candidate): candidate is GraphData => Boolean(candidate),
    )
    const edge = candidates
      .map(graphData => buildTextSelectionWidgetEdge({
        graphData,
        session: args.session,
        targetNodeId: args.targetNodeId,
      }))
      .find((candidate): candidate is GraphEdge => Boolean(candidate)) || null

    if (edge) {
      resolvedEdge = edge
      if (candidates.some(graphData => isTextSelectionWidgetEdgePersisted({ graphData, edge }))) {
        return { kind: 'persisted', edge }
      }
      args.addEdge(edge)
      const graphDataAfterWrite = args.readGraphDataCandidates()
      if (graphDataAfterWrite.some(graphData => (
        isTextSelectionWidgetEdgePersisted({ graphData, edge })
      ))) {
        return { kind: 'persisted', edge }
      }
    }

    if (attempt + 1 < maxAttempts) await args.waitForGraphMutation()
  }

  return resolvedEdge ? { kind: 'rejected', edge: resolvedEdge } : { kind: 'unresolved' }
}
