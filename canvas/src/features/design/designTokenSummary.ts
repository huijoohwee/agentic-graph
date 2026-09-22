import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashStringToHex } from '@/lib/hash/stringHash'

export type DesignTokenSummaryEntry = { value: string; count: number; sampleNodeIds: string[] }
export type DesignObservation = { nodeId: string; path: string; value: string | number }
export type DesignTokenSummary = {
  semanticKey: string
  nodeCount: number
  scannedNodes: number
  visitedProperties: number
  totalProperties: null
  truncated: boolean
  observations: DesignObservation[]
  typeEntries: DesignTokenSummaryEntry[]
  colorEntries: DesignTokenSummaryEntry[]
  typographyEntries: DesignTokenSummaryEntry[]
  spacingEntries: DesignTokenSummaryEntry[]
}
export const DESIGN_SCAN_LIMITS = Object.freeze({ nodes: 2000, properties: 10000, depth: 16, observations: 256 })
const summaryCache = new Map<string, DesignTokenSummary>()
const text = (value: unknown) => String(value ?? '').trim()
const object = (value: unknown): value is Record<string, JSONValue> => !!value && typeof value === 'object'
const normalizeColor = (value: unknown) => {
  const valueText = text(value)
  return /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([^;{}]+\)|var\(--[-a-z0-9]+\))$/i.test(valueText)
    ? valueText.toLowerCase().replace(/\s+/g, '') : ''
}
const numericText = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? String(Math.round(value * 100) / 100) : ''
const add = (bucket: Map<string, DesignTokenSummaryEntry>, value: string, nodeId: string) => {
  if (!value) return
  const entry = bucket.get(value) || { value, count: 0, sampleNodeIds: [] }
  entry.count += 1
  if (nodeId && entry.sampleNodeIds.length < 4 && !entry.sampleNodeIds.includes(nodeId)) entry.sampleNodeIds.push(nodeId)
  bucket.set(value, entry)
}
const entries = (bucket: Map<string, DesignTokenSummaryEntry>, limit: number) => [...bucket.values()]
  .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)).slice(0, limit)

export function summarizeDesignTokens(args: {
  graphData?: GraphData | null
  graphRevision?: number | null
  maxEntries?: number
}): DesignTokenSummary {
  const graph = args.graphData || null
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const maxEntries = Number.isFinite(args.maxEntries) ? Math.max(1, Math.min(24, Math.floor(args.maxEntries!))) : 8
  const types = new Map<string, DesignTokenSummaryEntry>(), colors = new Map<string, DesignTokenSummaryEntry>()
  const typography = new Map<string, DesignTokenSummaryEntry>(), spacing = new Map<string, DesignTokenSummaryEntry>()
  const observations: DesignObservation[] = []
  let visitedProperties = 0, scannedNodes = 0, truncated = nodes.length > DESIGN_SCAN_LIMITS.nodes
  const scan = (node: GraphNode) => {
    const nodeId = text(node.id)
    if (nodeId.length > 256) { truncated = true; return }
    add(types, text(node.type).slice(0, 128), nodeId)
    const ancestors = new WeakSet<object>()
    const walk = (value: unknown, path: string, depth: number): void => {
      if (visitedProperties >= DESIGN_SCAN_LIMITS.properties) { truncated = true; return }
      visitedProperties += 1
      // Rejected paths still consume work; otherwise wide malformed siblings bypass the cap.
      if (depth > DESIGN_SCAN_LIMITS.depth || path.length > 256) { truncated = true; return }
      if (object(value)) {
        if (ancestors.has(value)) { truncated = true; return }
        ancestors.add(value)
        for (const key in value) {
          if (!Object.prototype.hasOwnProperty.call(value, key)) continue
          if (visitedProperties >= DESIGN_SCAN_LIMITS.properties) { truncated = true; break }
          walk(value[key], path ? `${path}.${key}` : key, depth + 1)
        }
        ancestors.delete(value)
        return
      }
      if (typeof value !== 'string' && typeof value !== 'number') return
      if (typeof value === 'string' && value.length > 512 || typeof value === 'number' && !Number.isFinite(value)) {
        truncated = true; return
      }
      if (observations.length < DESIGN_SCAN_LIMITS.observations) observations.push({ nodeId, path, value })
      else truncated = true
      const key = path.replace(/^properties\./, '')
      const color = normalizeColor(value)
      if (color && /color|fill|stroke|background|border/i.test(key)) add(colors, color, nodeId)
      const number = numericText(value)
      if (!number) return
      if (/font|line-height|letter-spacing|weight/i.test(key)) add(typography, `${key}:${number}`, nodeId)
      else if (/gap|padding|margin|radius|width|height|inset/i.test(key)) add(spacing, `${key}:${number}`, nodeId)
    }
    walk(node.properties, 'properties', 0)
    walk(node.metadata, 'metadata', 0)
  }
  for (const node of nodes.slice(0, DESIGN_SCAN_LIMITS.nodes)) {
    if (visitedProperties >= DESIGN_SCAN_LIMITS.properties) { truncated = true; break }
    scan(node); scannedNodes += 1
  }
  const content = { nodeCount: nodes.length, scannedNodes, visitedProperties, totalProperties: null, truncated, observations,
    typeEntries: entries(types, maxEntries), colorEntries: entries(colors, maxEntries),
    typographyEntries: entries(typography, maxEntries), spacingEntries: entries(spacing, maxEntries) }
  const serialized = JSON.stringify(content)
  const semanticKey = buildScopedGraphSemanticKey('design-token-summary', {
    // Do not let generic graph identity traverse outside the explicitly bounded scan.
    graphData: { type: 'Graph', nodes: [], edges: [] }, graphRevision: args.graphRevision,
    sourceLayerHash: hashStringToHex(serialized), sourceLayerOrderHash: String(maxEntries),
  })
  // Exact bounded content participates in the cache key; a short fingerprint alone is not identity.
  const cacheKey = `${semanticKey}:${serialized}`
  const cached = summaryCache.get(cacheKey)
  if (cached) return cached
  const summary = { semanticKey, ...content }
  if (!truncated) {
    summaryCache.set(cacheKey, summary)
    if (summaryCache.size > 12) summaryCache.delete(summaryCache.keys().next().value!)
  }
  return summary
}
