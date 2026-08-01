import type { GraphEdge } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { readFlowEdgeDisplayLabel } from '@/lib/graph/flowPorts'
import { readEdgeMarkerPresentation } from '@/lib/graph/edgeMarkers'

function readStringEdgeProp(e: GraphEdge, key: string): string {
  const props = (e.properties || {}) as Record<string, unknown>
  const raw = props[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function coerceEndpointId(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const id = (v as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return String(id)
  }
  return ''
}

function shouldHidePointsToLabelInMermaidEdge(e: GraphEdge): boolean {
  if (String(e.label || '').trim() !== 'pointsTo') return false
  const src = coerceEndpointId((e as unknown as { source?: unknown }).source)
  if (!src) return false
  if (!src.startsWith('mermaid:')) return false
  const displayLabel = readStringEdgeProp(e, 'frontmatter:displayLabel')
  if (displayLabel) return false
  return true
}

export const isKeywordEdge = (e: GraphEdge): boolean => {
  const props = (e.properties || {}) as Record<string, unknown>
  const kind = typeof props['keyword:kind'] === 'string' ? String(props['keyword:kind']).trim() : ''
  return !!kind
}

export const shouldShowEdgeArrow = (e: GraphEdge, schema: GraphSchema): boolean => {
  return readEdgeMarkerPresentation(e, schema).end !== 'none'
}

export const getEdgeLabelForDisplay = (e: GraphEdge): string => {
  const flowLabel = String(readFlowEdgeDisplayLabel(e) || '').trim()
  if (flowLabel) return flowLabel
  const frontmatterDisplayLabel = readStringEdgeProp(e, 'frontmatter:displayLabel')
  if (frontmatterDisplayLabel) return frontmatterDisplayLabel
  const label = String(e.label || '').trim()
  if (shouldHidePointsToLabelInMermaidEdge(e)) return ''
  if (!isKeywordEdge(e)) return label
  const clean = label.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return clean || label
}
