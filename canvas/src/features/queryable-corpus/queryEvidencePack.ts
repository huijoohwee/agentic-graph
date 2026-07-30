import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'

export type CorpusQueryIntent = 'ask' | 'path' | 'explain' | 'impact' | 'compare' | 'summarize'

export type CorpusQueryEvidencePack = {
  query: string
  intent: CorpusQueryIntent
  selectedNodeId?: string
  graphRefs: string[]
  sourceRefs: Array<{
    sourcePath: string
    lineStart?: number
    lineEnd?: number
    evidenceKind: 'extracted' | 'inferred' | 'ambiguous'
    confidence: 'low' | 'medium' | 'high'
    excerpt: string
  }>
  traversal: {
    nodeIds: string[]
    edgeIds: string[]
    maxDepth: number
  }
  budget: {
    maxPromptTokens: number
    estimatedPromptTokens: number
    cacheHits: number
  }
  costLog: {
    model: string
    prompt_tokens: number
    completion_tokens: number
    cache_hits: number
    estimated_cost_usd: number
    basis: 'preflight-evidence-pack'
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const normalize = (value: unknown): string => String(value || '').trim()

const normalizeLower = (value: unknown): string => normalize(value).toLowerCase()

const tokenize = (value: string): string[] =>
  normalizeLower(value)
    .split(/[^a-z0-9_.$/-]+/i)
    .map(part => part.trim())
    .filter(part => part.length >= 2)
    .slice(0, 32)

const jsonPreview = (value: unknown, maxChars = 600): string => {
  if (typeof value === 'string') return value.slice(0, maxChars)
  try {
    return JSON.stringify(value).slice(0, maxChars)
  } catch {
    return String(value).slice(0, maxChars)
  }
}

export function classifyCorpusQueryIntent(queryRaw: string): CorpusQueryIntent {
  const query = normalizeLower(queryRaw)
  if (!query) return 'ask'
  if (/\b(path|connects?|connected|connection|between|from .+ to )\b/.test(query)) return 'path'
  if (/\b(explain|what is|what does|describe)\b/.test(query)) return 'explain'
  if (/\b(depends on|dependents|impact|affected|blast radius)\b/.test(query)) return 'impact'
  if (/\b(compare|versus| vs |difference|similar)\b/.test(query)) return 'compare'
  if (/\b(summarize|summary|overview|map this corpus|map folder)\b/.test(query)) return 'summarize'
  return 'ask'
}

function nodeSearchText(node: GraphNode): string {
  return [
    node.id,
    node.label,
    node.type,
    jsonPreview(node.properties || {}, 1200),
    jsonPreview((node as { metadata?: JSONValue }).metadata || {}, 600),
  ].join(' ')
}

function edgeSearchText(edge: GraphEdge, nodeById: Map<string, GraphNode>): string {
  const src = nodeById.get(String(edge.source || ''))
  const tgt = nodeById.get(String(edge.target || ''))
  return [
    edge.id,
    edge.label,
    src?.label,
    tgt?.label,
    jsonPreview(edge.properties || {}, 1000),
  ].join(' ')
}

function scoreText(textRaw: string, terms: string[]): number {
  const text = normalizeLower(textRaw)
  if (!text || terms.length === 0) return 0
  let score = 0
  for (const term of terms) {
    if (!term) continue
    if (text.includes(term)) score += term.length >= 4 ? 3 : 1
  }
  return score
}

const readEvidenceKind = (props: Record<string, unknown>): 'extracted' | 'inferred' | 'ambiguous' => {
  const raw = normalizeLower(props['evidence:kind'])
  if (raw === 'inferred' || raw === 'ambiguous') return raw
  return 'extracted'
}

const readConfidence = (props: Record<string, unknown>): 'low' | 'medium' | 'high' => {
  const raw = normalizeLower(props['evidence:confidence'])
  if (raw === 'low' || raw === 'medium') return raw
  return 'high'
}

const toLineNumber = (value: unknown): number | undefined => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

function edgeSourceRef(edge: GraphEdge, nodeById: Map<string, GraphNode>): CorpusQueryEvidencePack['sourceRefs'][number] | null {
  const props = asRecord(edge.properties)
  const sourcePath = normalize(props['evidence:sourcePath']) || normalize(props['corpus:sourcePath'])
  if (!sourcePath) return null
  const src = nodeById.get(String(edge.source || ''))
  const tgt = nodeById.get(String(edge.target || ''))
  const lineStart = toLineNumber(props['evidence:lineStart'])
  const lineEnd = toLineNumber(props['evidence:lineEnd']) || lineStart
  const excerpt = [
    src?.label || edge.source,
    edge.label || 'related',
    tgt?.label || edge.target,
  ].map(normalize).filter(Boolean).join(' -> ')
  return {
    sourcePath,
    ...(lineStart ? { lineStart } : {}),
    ...(lineEnd ? { lineEnd } : {}),
    evidenceKind: readEvidenceKind(props),
    confidence: readConfidence(props),
    excerpt,
  }
}

function collectAdjacentEdges(args: {
  edges: GraphEdge[]
  seedNodeIds: Set<string>
  maxEdges: number
}): GraphEdge[] {
  const out: GraphEdge[] = []
  const seen = new Set<string>()
  for (const edge of args.edges) {
    const source = String(edge.source || '')
    const target = String(edge.target || '')
    if (!args.seedNodeIds.has(source) && !args.seedNodeIds.has(target)) continue
    const id = String(edge.id || `${source}:${edge.label}:${target}`)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(edge)
    if (out.length >= args.maxEdges) break
  }
  return out
}

function buildIncidentEdgeIndex(edges: GraphEdge[]): Map<string, GraphEdge[]> {
  const index = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    const source = String(edge.source || '')
    const target = String(edge.target || '')
    if (source) index.set(source, [...(index.get(source) || []), edge])
    if (target && target !== source) index.set(target, [...(index.get(target) || []), edge])
  }
  return index
}

function findQueryEndpointNodeIds(args: {
  nodes: GraphNode[]
  terms: string[]
  selectedNodeId?: string | null
}): { startIds: Set<string>; targetIds: Set<string> } {
  const buckets: Array<{ term: string; ids: string[] }> = []
  for (const term of args.terms) {
    const ids = args.nodes
      .map(node => {
        const id = String(node.id || '')
        const label = normalizeLower(node.label || node.id)
        const text = normalizeLower(nodeSearchText(node))
        const exact = label === term || label.split(/[./:-]+/).includes(term)
        return { id, score: exact ? 20 : scoreText(text, [term]) }
      })
      .filter(row => row.id && row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(row => row.id)
    if (ids.length) buckets.push({ term, ids })
  }
  const selected = normalize(args.selectedNodeId)
  const first = selected ? [selected] : buckets[0]?.ids || []
  const second = buckets.find(bucket => bucket.ids.some(id => !first.includes(id)))?.ids || []
  return {
    startIds: new Set(first.filter(Boolean)),
    targetIds: new Set(second.filter(id => id && !first.includes(id))),
  }
}

function findShortestEvidencePath(args: {
  edges: GraphEdge[]
  startIds: Set<string>
  targetIds: Set<string>
  maxDepth: number
}): { nodeIds: string[]; edgeIds: string[]; edges: GraphEdge[] } | null {
  if (args.startIds.size < 1 || args.targetIds.size < 1) return null
  const edgeIndex = buildIncidentEdgeIndex(args.edges)
  const queue: Array<{ nodeId: string; nodeIds: string[]; edgeIds: string[]; edges: GraphEdge[] }> = []
  const visited = new Set<string>()
  for (const nodeId of args.startIds) {
    queue.push({ nodeId, nodeIds: [nodeId], edgeIds: [], edges: [] })
    visited.add(nodeId)
  }
  while (queue.length) {
    const current = queue.shift()
    if (!current) break
    if (args.targetIds.has(current.nodeId) && current.edgeIds.length > 0) return current
    if (current.edgeIds.length >= args.maxDepth) continue
    for (const edge of edgeIndex.get(current.nodeId) || []) {
      const edgeId = String(edge.id || `${edge.source}:${edge.label}:${edge.target}`)
      const nextNodeId = String(edge.source) === current.nodeId ? String(edge.target || '') : String(edge.source || '')
      if (!nextNodeId || visited.has(nextNodeId)) continue
      visited.add(nextNodeId)
      queue.push({
        nodeId: nextNodeId,
        nodeIds: [...current.nodeIds, nextNodeId],
        edgeIds: [...current.edgeIds, edgeId],
        edges: [...current.edges, edge],
      })
    }
  }
  return null
}

function collectNeighborhoodTraversal(args: {
  edges: GraphEdge[]
  seedNodeIds: Set<string>
  maxDepth: number
  maxEdges: number
}): { nodeIds: string[]; edgeIds: string[]; edges: GraphEdge[] } {
  const edgeIndex = buildIncidentEdgeIndex(args.edges)
  const seenNodes = new Set<string>(args.seedNodeIds)
  const seenEdges = new Set<string>()
  const queue = Array.from(args.seedNodeIds).map(nodeId => ({ nodeId, depth: 0 }))
  const outEdges: GraphEdge[] = []
  while (queue.length && outEdges.length < args.maxEdges) {
    const current = queue.shift()
    if (!current || current.depth >= args.maxDepth) continue
    for (const edge of edgeIndex.get(current.nodeId) || []) {
      const edgeId = String(edge.id || `${edge.source}:${edge.label}:${edge.target}`)
      if (seenEdges.has(edgeId)) continue
      seenEdges.add(edgeId)
      outEdges.push(edge)
      const nextNodeId = String(edge.source) === current.nodeId ? String(edge.target || '') : String(edge.source || '')
      if (nextNodeId && !seenNodes.has(nextNodeId)) {
        seenNodes.add(nextNodeId)
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 })
      }
      if (outEdges.length >= args.maxEdges) break
    }
  }
  return {
    nodeIds: Array.from(seenNodes),
    edgeIds: Array.from(seenEdges),
    edges: outEdges,
  }
}

export function buildCorpusQueryEvidencePack(args: {
  graphData: GraphData | null | undefined
  query: string
  selectedNodeId?: string | null
  maxPromptTokens?: number
  maxSourceRefs?: number
  model?: string | null
  completionTokenBudget?: number | null
}): CorpusQueryEvidencePack {
  const graphData = args.graphData || null
  const query = normalize(args.query)
  const maxPromptTokens = Math.max(1200, Math.min(12000, Number(args.maxPromptTokens || 8000)))
  const maxSourceRefs = Math.max(1, Math.min(32, Number(args.maxSourceRefs || 12)))
  const nodes = Array.isArray(graphData?.nodes) ? graphData!.nodes : []
  const edges = Array.isArray(graphData?.edges) ? graphData!.edges : []
  const nodeById = new Map(nodes.map(node => [String(node.id || ''), node] as const).filter(([id]) => Boolean(id)))
  const terms = tokenize(query)
  const intent = classifyCorpusQueryIntent(query)

  const rankedNodes = nodes
    .map(node => ({
      node,
      score: scoreText(nodeSearchText(node), terms) + (args.selectedNodeId && node.id === args.selectedNodeId ? 20 : 0),
    }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)

  const seedNodeIds = new Set<string>()
  if (args.selectedNodeId) seedNodeIds.add(String(args.selectedNodeId))
  for (const row of rankedNodes.slice(0, 8)) seedNodeIds.add(String(row.node.id || ''))

  const traversalDepth = intent === 'path' || intent === 'impact' ? 3 : 2
  const endpointIds = findQueryEndpointNodeIds({ nodes, terms, selectedNodeId: args.selectedNodeId })
  const explicitPath = intent === 'path'
    ? findShortestEvidencePath({ edges, startIds: endpointIds.startIds, targetIds: endpointIds.targetIds, maxDepth: traversalDepth })
    : null
  const neighborhood = intent === 'explain' || intent === 'impact'
    ? collectNeighborhoodTraversal({ edges, seedNodeIds, maxDepth: traversalDepth, maxEdges: maxSourceRefs })
    : null
  for (const nodeId of explicitPath?.nodeIds || []) seedNodeIds.add(nodeId)
  for (const nodeId of neighborhood?.nodeIds || []) seedNodeIds.add(nodeId)

  const rankedEdges = edges
    .map(edge => ({
      edge,
      score:
        scoreText(edgeSearchText(edge, nodeById), terms)
        + (seedNodeIds.has(String(edge.source || '')) || seedNodeIds.has(String(edge.target || '')) ? 6 : 0),
    }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(row => row.edge)

  const adjacent = collectAdjacentEdges({ edges, seedNodeIds, maxEdges: maxSourceRefs })
  const edgeList = [...(explicitPath?.edges || []), ...(neighborhood?.edges || []), ...rankedEdges, ...adjacent]
  const sourceRefs: CorpusQueryEvidencePack['sourceRefs'] = []
  const seenSourceRefs = new Set<string>()
  const traversalNodeIds = new Set<string>(seedNodeIds)
  const traversalEdgeIds: string[] = [...(explicitPath?.edgeIds || []), ...(neighborhood?.edgeIds || [])]
  for (const edge of edgeList) {
    const edgeId = String(edge.id || '')
    if (edgeId && !traversalEdgeIds.includes(edgeId)) traversalEdgeIds.push(edgeId)
    if (edge.source) traversalNodeIds.add(String(edge.source))
    if (edge.target) traversalNodeIds.add(String(edge.target))
    const ref = edgeSourceRef(edge, nodeById)
    if (!ref) continue
    const key = `${ref.sourcePath}:${ref.lineStart || 0}:${ref.excerpt}`
    if (seenSourceRefs.has(key)) continue
    seenSourceRefs.add(key)
    sourceRefs.push(ref)
    if (sourceRefs.length >= maxSourceRefs) break
  }

  const nodeRefs = Array.from(traversalNodeIds)
    .filter(Boolean)
    .slice(0, 16)
    .map(id => `@node:${id}`)
  const edgeRefs = traversalEdgeIds
    .filter(Boolean)
    .slice(0, 16)
    .map(id => `@edge:${id}`)
  const graphRefs = [...nodeRefs, ...edgeRefs]
  const serializedSize = JSON.stringify({ query, intent, graphRefs, sourceRefs }).length
  const estimatedPromptTokens = Math.ceil(serializedSize / 4)
  const cacheHits = 0
  const completionTokenBudget = Math.max(0, Math.floor(Number(args.completionTokenBudget || 0)) || 0)
  const model = normalize(args.model) || 'unknown'

  return {
    query,
    intent,
    ...(args.selectedNodeId ? { selectedNodeId: String(args.selectedNodeId) } : {}),
    graphRefs,
    sourceRefs,
    traversal: {
      nodeIds: Array.from(traversalNodeIds).filter(Boolean).slice(0, 32),
      edgeIds: traversalEdgeIds.slice(0, 32),
      maxDepth: traversalDepth,
    },
    budget: {
      maxPromptTokens,
      estimatedPromptTokens,
      cacheHits,
    },
    costLog: {
      model,
      prompt_tokens: estimatedPromptTokens,
      completion_tokens: completionTokenBudget,
      cache_hits: cacheHits,
      estimated_cost_usd: 0,
      basis: 'preflight-evidence-pack',
    },
  }
}

export function buildCorpusQueryEvidencePrompt(pack: CorpusQueryEvidencePack): string | null {
  if (!pack.query || (pack.sourceRefs.length === 0 && pack.graphRefs.length === 0)) return null
  return [
    'queryableCorpusEvidencePack(): Answer from this graph evidence before using general knowledge.',
    'If evidence is insufficient, say what is missing. Every factual claim about the imported corpus must cite sourceRefs or graphRefs.',
    'Do not invent files, symbols, tables, commands, media content, or relationships that are absent from the evidence pack.',
    'Return or preserve a costLog with model, prompt_tokens, completion_tokens, cache_hits, and estimated_cost_usd; update token counts from provider usage when available.',
    '',
    '```json',
    JSON.stringify(pack, null, 2),
    '```',
  ].join('\n')
}
