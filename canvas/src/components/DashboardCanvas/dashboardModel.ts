import { unwrapKeyTypeValue as unwrapGraphValue } from '@/lib/graph/keyTypeValue'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { isPlainObject } from '@/lib/graph/value'
import { readCanvasGridConfigFromSchema } from '@/lib/canvas/canvasGridConfig'

export type DashboardTone = 'blue' | 'green' | 'amber' | 'rose' | 'slate'

export type DashboardSeriesPoint = {
  label: string
  value: number
  detail?: string
}

export type DashboardTableRow = {
  id: string
  label: string
  value: string
  detail?: string
}

export type DashboardMetric = {
  id: string
  label: string
  value: string
  detail: string
  tone: DashboardTone
}

export type DashboardCardKind = 'bar' | 'line' | 'area' | 'table'

export type DashboardCard = {
  id: string
  title: string
  subtitle: string
  kind: DashboardCardKind
  tone: DashboardTone
  series: DashboardSeriesPoint[]
  rows: DashboardTableRow[]
  footnote?: string
}

export type DashboardSection = {
  id: string
  title: string
  cadence: string
  cards: DashboardCard[]
}

export type DashboardCanvasModel = {
  title: string
  subtitle: string
  metrics: DashboardMetric[]
  heroSeries: DashboardSeriesPoint[]
  sections: DashboardSection[]
  grid: {
    enabled: boolean
    variant: string
    majorEvery: number
  }
}

type CountRecord = Record<string, number>

type SemanticBucket = 'input' | 'process' | 'output' | 'media'

type NumericAggregate = {
  label: string
  count: number
  sum: number
  min: number
  max: number
}

const MAX_SERIES = 7
const MAX_TABLE_ROWS = 24
const EMPTY_GRAPH_TITLE = 'Workspace Dashboard'

const SEMANTIC_BUCKETS: ReadonlyArray<{ bucket: SemanticBucket; label: string; terms: readonly string[] }> = [
  { bucket: 'input', label: 'Inputs', terms: ['input', 'source', 'query', 'prompt', 'parameter', 'seed'] },
  { bucket: 'process', label: 'Process', terms: ['process', 'compute', 'run', 'step', 'transform', 'method'] },
  { bucket: 'output', label: 'Outputs', terms: ['output', 'result', 'response', 'artifact', 'summary', 'answer'] },
  { bucket: 'media', label: 'Media', terms: ['media', 'image', 'video', 'audio', 'html', 'srcdoc', 'url', 'preview'] },
]

const cleanText = (value: unknown): string => String(value ?? '').trim()

const titleCase = (value: string): string => {
  const cleaned = value.replace(/[_:-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  return cleaned.replace(/\b\w/g, char => char.toUpperCase())
}


const readGraphMetadataText = (graphData: GraphData | null | undefined, keys: readonly string[]): string => {
  const metadata = graphData?.metadata
  if (!metadata) return ''
  const records = [
    metadata,
    isPlainObject(metadata.frontmatterMeta) ? (metadata.frontmatterMeta as Record<string, unknown>) : null,
  ].filter(Boolean) as Array<Record<string, unknown>>
  for (const record of records) {
    for (const key of keys) {
      const value = unwrapGraphValue(record[key])
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return ''
}

const readDisplayTitle = (graphData: GraphData | null | undefined): string => {
  return (
    readGraphMetadataText(graphData, ['title', 'name', 'documentTitle', 'label']) ||
    titleCase(readGraphMetadataText(graphData, ['documentPath', 'sourcePath', 'path']).split('/').pop() || '') ||
    EMPTY_GRAPH_TITLE
  )
}

const readDisplaySubtitle = (graphData: GraphData | null | undefined): string => {
  const source = readGraphMetadataText(graphData, ['sourceKind', 'source', 'documentPath', 'sourcePath'])
  const kind = cleanText(graphData?.type)
  const parts = [kind, source].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Active graph summary'
}

const readNodeType = (node: GraphNode): string => {
  return titleCase(cleanText(node.type) || cleanText(node.properties?.type) || cleanText(node.label) || 'Node')
}

const readEdgeType = (edge: GraphEdge): string => {
  return titleCase(cleanText(edge.type) || cleanText(edge.label) || 'Edge')
}

const increment = (counts: CountRecord, key: string, amount = 1): void => {
  const label = titleCase(key) || 'Unknown'
  counts[label] = (counts[label] || 0) + amount
}

const topCounts = (counts: CountRecord, fallbackLabel: string): DashboardSeriesPoint[] => {
  const entries = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SERIES)

  if (entries.length === 0) return [{ label: fallbackLabel, value: 0 }]
  return entries.map(([label, value]) => ({ label, value }))
}

const classifySemanticBucket = (key: string, value: unknown): SemanticBucket | null => {
  const normalized = key.toLowerCase()
  for (const spec of SEMANTIC_BUCKETS) {
    if (spec.terms.some(term => normalized.includes(term))) return spec.bucket
  }
  const unwrapped = unwrapGraphValue(value)
  if (typeof unwrapped !== 'string') return null
  const trimmed = unwrapped.trim().toLowerCase()
  if (/^https?:\/\//.test(trimmed) || trimmed.startsWith('<iframe') || trimmed.startsWith('<svg')) return 'media'
  return null
}

const addNumericAggregate = (aggregates: Map<string, NumericAggregate>, key: string, rawValue: unknown): void => {
  const value = unwrapGraphValue(rawValue)
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null
  if (numericValue == null) return
  const label = titleCase(key) || 'Value'
  const existing = aggregates.get(label)
  if (!existing) {
    aggregates.set(label, { label, count: 1, sum: numericValue, min: numericValue, max: numericValue })
    return
  }
  existing.count += 1
  existing.sum += numericValue
  existing.min = Math.min(existing.min, numericValue)
  existing.max = Math.max(existing.max, numericValue)
}

const collectProperties = (
  properties: Record<string, JSONValue> | null | undefined,
  semanticCounts: Record<SemanticBucket, number>,
  numericAggregates: Map<string, NumericAggregate>,
): void => {
  if (!properties) return
  for (const [key, rawValue] of Object.entries(properties)) {
    const bucket = classifySemanticBucket(key, rawValue)
    if (bucket) semanticCounts[bucket] += 1
    addNumericAggregate(numericAggregates, key, rawValue)
  }
}

const buildDegreeRows = (nodes: GraphNode[], edges: GraphEdge[]): DashboardTableRow[] => {
  const degreeById = new Map<string, { in: number; out: number }>()
  for (const node of nodes) {
    degreeById.set(node.id, { in: 0, out: 0 })
  }
  for (const edge of edges) {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (src && degreeById.has(src)) degreeById.get(src)!.out += 1
    if (tgt && degreeById.has(tgt)) degreeById.get(tgt)!.in += 1
  }
  return nodes
    .map(node => {
      const degree = degreeById.get(node.id) || { in: 0, out: 0 }
      return {
        id: node.id,
        label: cleanText(node.label) || node.id,
        value: String(degree.in + degree.out),
        detail: `${degree.out} out · ${degree.in} in`,
      }
    })
    .sort((a, b) => Number(b.value) - Number(a.value) || a.label.localeCompare(b.label))
    .slice(0, MAX_TABLE_ROWS)
}

const buildHeroSeries = (nodes: GraphNode[], edges: GraphEdge[]): DashboardSeriesPoint[] => {
  const length = Math.max(nodes.length, edges.length, 1)
  const points: DashboardSeriesPoint[] = []
  for (let index = 0; index < length; index += 1) {
    const nodeShare = Math.min(nodes.length, index + 1)
    const edgeShare = Math.min(edges.length, index + 1)
    points.push({
      label: String(index + 1),
      value: nodeShare + edgeShare,
      detail: `${nodeShare} nodes · ${edgeShare} edges`,
    })
  }
  return points
}

const buildNumericSeries = (aggregates: Map<string, NumericAggregate>): DashboardSeriesPoint[] => {
  const series = Array.from(aggregates.values())
    .map(item => ({
      label: item.label,
      value: item.count === 0 ? 0 : Number((item.sum / item.count).toFixed(2)),
      detail: `${item.count} values · min ${item.min} · max ${item.max}`,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, MAX_SERIES)
  return series.length ? series : [{ label: 'Numeric fields', value: 0 }]
}

const buildSemanticSeries = (semanticCounts: Record<SemanticBucket, number>): DashboardSeriesPoint[] => {
  return SEMANTIC_BUCKETS.map(spec => ({
    label: spec.label,
    value: semanticCounts[spec.bucket],
  }))
}

const buildCoverageSeries = (nodes: GraphNode[]): DashboardSeriesPoint[] => {
  const counts: CountRecord = {}
  for (const node of nodes) {
    const properties = node.properties || {}
    const filled = Object.values(properties).filter(value => {
      const unwrapped = unwrapGraphValue(value)
      if (unwrapped == null) return false
      if (typeof unwrapped === 'string') return unwrapped.trim().length > 0
      if (Array.isArray(unwrapped)) return unwrapped.length > 0
      if (isPlainObject(unwrapped)) return Object.keys(unwrapped).length > 0
      return true
    }).length
    increment(counts, readNodeType(node), filled)
  }
  return topCounts(counts, 'Properties')
}

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`

export function buildDashboardCanvasModel(
  graphData: GraphData | null | undefined,
  schema: GraphSchema | null | undefined,
): DashboardCanvasModel {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const edges = Array.isArray(graphData?.edges) ? graphData.edges : []
  const nodeTypeCounts: CountRecord = {}
  const edgeTypeCounts: CountRecord = {}
  const numericAggregates = new Map<string, NumericAggregate>()
  const semanticCounts: Record<SemanticBucket, number> = {
    input: 0,
    process: 0,
    output: 0,
    media: 0,
  }

  for (const node of nodes) {
    increment(nodeTypeCounts, readNodeType(node))
    collectProperties(node.properties, semanticCounts, numericAggregates)
  }
  for (const edge of edges) {
    increment(edgeTypeCounts, readEdgeType(edge))
    collectProperties(edge.properties, semanticCounts, numericAggregates)
  }

  const connectedNodeIds = new Set<string>()
  for (const edge of edges) {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (src) connectedNodeIds.add(src)
    if (tgt) connectedNodeIds.add(tgt)
  }
  const densityDenominator = Math.max(1, nodes.length * Math.max(1, nodes.length - 1))
  const density = edges.length / densityDenominator
  const isolatedNodes = nodes.filter(node => !connectedNodeIds.has(node.id)).length
  const numericFields = numericAggregates.size
  const outputSignals = semanticCounts.output + semanticCounts.media
  const grid = readCanvasGridConfigFromSchema(schema)

  return {
    title: readDisplayTitle(graphData),
    subtitle: readDisplaySubtitle(graphData),
    heroSeries: buildHeroSeries(nodes, edges),
    grid: {
      enabled: grid.enabled,
      variant: grid.variant,
      majorEvery: grid.majorEvery,
    },
    metrics: [
      { id: 'nodes', label: 'Nodes', value: String(nodes.length), detail: `${Object.keys(nodeTypeCounts).length} types`, tone: 'blue' },
      { id: 'edges', label: 'Edges', value: String(edges.length), detail: `${Object.keys(edgeTypeCounts).length} relationship types`, tone: 'green' },
      { id: 'density', label: 'Density', value: formatPercent(density), detail: `${isolatedNodes} isolated nodes`, tone: isolatedNodes > 0 ? 'amber' : 'green' },
      { id: 'signals', label: 'Signals', value: String(numericFields + outputSignals), detail: `${numericFields} numeric · ${outputSignals} output/media`, tone: 'rose' },
      { id: 'grid', label: 'Grid', value: grid.enabled ? 'On' : 'Off', detail: `${grid.variant} · major ${grid.majorEvery}`, tone: grid.enabled ? 'blue' : 'slate' },
    ],
    sections: [
      {
        id: 'structure',
        title: 'Structure',
        cadence: 'Current graph',
        cards: [
          {
            id: 'node-types',
            title: 'Node Types',
            subtitle: 'Distribution by node type',
            kind: 'bar',
            tone: 'blue',
            series: topCounts(nodeTypeCounts, 'Nodes'),
            rows: [],
          },
          {
            id: 'edge-types',
            title: 'Relationship Types',
            subtitle: 'Distribution by edge type',
            kind: 'bar',
            tone: 'green',
            series: topCounts(edgeTypeCounts, 'Relationships'),
            rows: [],
          },
          {
            id: 'degree-leaders',
            title: 'Connection Leaders',
            subtitle: 'Highest combined in/out degree',
            kind: 'table',
            tone: 'slate',
            series: [],
            rows: buildDegreeRows(nodes, edges),
          },
        ],
      },
      {
        id: 'signals',
        title: 'Signals',
        cadence: 'Derived fields',
        cards: [
          {
            id: 'numeric-summary',
            title: 'Numeric Fields',
            subtitle: 'Average finite numeric values',
            kind: 'bar',
            tone: 'amber',
            series: buildNumericSeries(numericAggregates),
            rows: [],
          },
          {
            id: 'semantic-buckets',
            title: 'Semantic Buckets',
            subtitle: 'Input, process, output, and media fields',
            kind: 'area',
            tone: 'rose',
            series: buildSemanticSeries(semanticCounts),
            rows: [],
          },
          {
            id: 'property-coverage',
            title: 'Property Coverage',
            subtitle: 'Filled property count by node type',
            kind: 'line',
            tone: 'green',
            series: buildCoverageSeries(nodes),
            rows: [],
          },
        ],
      },
    ],
  }
}
