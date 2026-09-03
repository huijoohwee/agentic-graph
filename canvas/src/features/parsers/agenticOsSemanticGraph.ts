import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashSignatureParts } from '@/lib/hash/signature'

export const AGENTIC_OS_SEMANTIC_GRAPH_CONTEXT = 'agentic-os-semantic'
export const AGENTIC_OS_SEMANTIC_GRAPH_KIND = 'agentic-os-semantic'

type AgenticOsSemanticNodeToken = {
  raw: string
  id: string
  type: string
  line: number
}

type AgenticOsSemanticEdgeToken = {
  raw: string
  predicate: string
  source: string
  target: string
  line: number
}

type ParseAgenticOsSemanticGraphArgs = {
  name: string | null | undefined
  text: string | null | undefined
  strict?: boolean
}

type ParsedAgenticOsSemanticGraph = {
  graphData: GraphData
  warnings: string[]
}

const NODE_SIGIL_RE = /`@node:([^`:\s]{1,80}):([^`\s]{1,180})`/g
const EDGE_SIGIL_RE = /`@edge:([^`:\s]{1,80}):([^`]{1,360})`/g

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const asCleanString = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

const normalizeToken = (value: unknown): string => asCleanString(value).toLowerCase()

const isPlaceholderToken = (value: unknown): boolean => /[{}]/.test(asCleanString(value))

const readStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < value.length; i += 1) {
    const text = asCleanString(value[i])
    if (!text) continue
    const key = normalizeToken(text)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

const humanizeId = (value: string): string => {
  const text = asCleanString(value)
  if (!text) return ''
  return text
    .replace(/^[-:_./\\]+|[-:_./\\]+$/g, '')
    .replace(/[-_./:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase())
}

const splitEdgeEndpoints = (raw: string): { source: string; target: string } | null => {
  const body = asCleanString(raw)
  if (!body) return null
  const arrowCandidates = ['\u2192', '->', '=>']
  for (let i = 0; i < arrowCandidates.length; i += 1) {
    const arrow = arrowCandidates[i]!
    const idx = body.indexOf(arrow)
    if (idx <= 0) continue
    const source = asCleanString(body.slice(0, idx))
    const target = asCleanString(body.slice(idx + arrow.length))
    if (source && target) return { source, target }
  }
  return null
}

const scanAgenticOsSemanticSigils = (lines: string[], startIndex: number): {
  nodes: AgenticOsSemanticNodeToken[]
  edges: AgenticOsSemanticEdgeToken[]
} => {
  const nodes: AgenticOsSemanticNodeToken[] = []
  const edges: AgenticOsSemanticEdgeToken[] = []
  let fencedMarker = ''

  for (let i = Math.max(0, startIndex); i < lines.length; i += 1) {
    const line = String(lines[i] ?? '')
    const trimmed = line.trim()
    const fenceMatch = /^(```+|~~~+)/.exec(trimmed)
    if (fenceMatch) {
      const marker = fenceMatch[1] || ''
      if (!fencedMarker) {
        fencedMarker = marker
      } else if (marker === fencedMarker) {
        fencedMarker = ''
      }
      continue
    }
    if (fencedMarker) continue

    NODE_SIGIL_RE.lastIndex = 0
    for (;;) {
      const match = NODE_SIGIL_RE.exec(line)
      if (!match) break
      const type = asCleanString(match[1])
      const id = asCleanString(match[2])
      if (!type || !id) continue
      if (isPlaceholderToken(type) || isPlaceholderToken(id)) continue
      nodes.push({
        raw: String(match[0] || ''),
        type,
        id,
        line: i + 1,
      })
    }

    EDGE_SIGIL_RE.lastIndex = 0
    for (;;) {
      const match = EDGE_SIGIL_RE.exec(line)
      if (!match) break
      const predicate = asCleanString(match[1])
      const endpointSplit = splitEdgeEndpoints(match[2] || '')
      if (!predicate || !endpointSplit) continue
      if (isPlaceholderToken(predicate) || isPlaceholderToken(endpointSplit.source) || isPlaceholderToken(endpointSplit.target)) continue
      edges.push({
        raw: String(match[0] || ''),
        predicate,
        source: endpointSplit.source,
        target: endpointSplit.target,
        line: i + 1,
      })
    }
  }

  return { nodes, edges }
}

const maybeThrowStrict = (strict: boolean | undefined, message: string): void => {
  if (strict === true) throw new Error(message)
}

const readSourceName = (name: string | null | undefined): string => {
  const normalized = String(name || '').replace(/\\/g, '/').trim()
  if (!normalized) return 'markdown'
  return normalized.split('/').pop() || normalized
}

const makeLineMeta = (source: string, line: number): Record<string, JSONValue> => ({
  source,
  lineStart: line,
  lineEnd: line,
})

const makeSemanticNode = (args: {
  id: string
  type: string
  source: string
  line: number
  raw?: string
  inferredFromEdge?: boolean
}): GraphNode => {
  const inferred = args.inferredFromEdge === true
  const semanticType = asCleanString(args.type) || 'AgenticOsNode'
  return {
    id: args.id,
    type: semanticType,
    label: humanizeId(args.id) || args.id,
    properties: {
      'agentic-os:semantic': true,
      'agentic-os:nodeType': semanticType,
      'agentic-os:source': inferred ? 'edge-endpoint' : 'markdown-sigil',
      ...(args.raw ? { 'agentic-os:sigil': args.raw } : {}),
      ...(inferred ? { 'agentic-os:inferredFromEdge': true } : {}),
    },
    metadata: makeLineMeta(args.source, args.line),
  }
}

const makeSemanticEdge = (args: {
  source: string
  target: string
  predicate: string
  line: number
  raw: string
  documentSource: string
}): GraphEdge => {
  const edgeHash = hashSignatureParts([
    'agentic-os-edge',
    args.source,
    args.predicate,
    args.target,
  ]).slice(0, 12)
  return {
    id: `agentic-os-edge:${args.predicate}:${edgeHash}`,
    source: args.source,
    target: args.target,
    label: args.predicate,
    type: 'AgenticOsSemanticEdge',
    properties: {
      'agentic-os:semantic': true,
      'agentic-os:predicate': args.predicate,
      'agentic-os:sigil': args.raw,
    },
    metadata: makeLineMeta(args.documentSource, args.line),
  }
}

export function parseAgenticOsSemanticGraphFromMarkdown(args: ParseAgenticOsSemanticGraphArgs): ParsedAgenticOsSemanticGraph | null {
  const text = String(args.text || '')
  if (!text.trim()) return null
  const lines = splitMarkdownLines(text)
  const { meta, startIndex, warnings: frontmatterWarnings } = parseMarkdownFrontmatter(lines)
  const declaredNodeTypes = readStringList(isRecord(meta) ? meta.node_types : null)
  const declaredEdgePredicates = readStringList(isRecord(meta) ? meta.edge_predicates : null)
  const declaredNodeTypeSet = new Set(declaredNodeTypes.map(normalizeToken).filter(Boolean))
  const declaredEdgePredicateSet = new Set(declaredEdgePredicates.map(normalizeToken).filter(Boolean))
  const schema = asCleanString(isRecord(meta) ? meta.schema : '')
  const source = readSourceName(args.name)
  const { nodes: nodeTokens, edges: edgeTokens } = scanAgenticOsSemanticSigils(lines, startIndex)
  if (nodeTokens.length === 0 && edgeTokens.length === 0) return null

  const warnings: string[] = [...frontmatterWarnings]
  const nodeById = new Map<string, GraphNode>()
  const explicitNodeIds = new Set<string>()

  for (let i = 0; i < nodeTokens.length; i += 1) {
    const token = nodeTokens[i]!
    const typeKey = normalizeToken(token.type)
    if (declaredNodeTypeSet.size > 0 && !declaredNodeTypeSet.has(typeKey)) {
      const message = `Unknown AGENTIC_OS node type "${token.type}" at line ${token.line}.`
      maybeThrowStrict(args.strict, message)
      warnings.push(message)
      continue
    }
    const existing = nodeById.get(token.id)
    if (existing && (existing.properties || {})['agentic-os:inferredFromEdge'] !== true) {
      const existingType = asCleanString((existing.properties || {})['agentic-os:nodeType'])
      if (normalizeToken(existingType) !== typeKey) {
        warnings.push(`Repeated AGENTIC_OS node "${token.id}" at line ${token.line} used different type "${token.type}".`)
      }
      continue
    }
    nodeById.set(token.id, makeSemanticNode({
      id: token.id,
      type: token.type,
      source,
      line: token.line,
      raw: token.raw,
    }))
    explicitNodeIds.add(token.id)
  }

  const edgeById = new Map<string, GraphEdge>()
  for (let i = 0; i < edgeTokens.length; i += 1) {
    const token = edgeTokens[i]!
    const predicateKey = normalizeToken(token.predicate)
    if (declaredEdgePredicateSet.size > 0 && !declaredEdgePredicateSet.has(predicateKey)) {
      const message = `Unknown AGENTIC_OS edge predicate "${token.predicate}" at line ${token.line}.`
      maybeThrowStrict(args.strict, message)
      warnings.push(message)
      continue
    }
    const hasDeclaredPredicate = declaredEdgePredicateSet.size > 0
    const hasExplicitEndpoint = explicitNodeIds.has(token.source) || explicitNodeIds.has(token.target)
    if (!hasDeclaredPredicate && !hasExplicitEndpoint) {
      warnings.push(`Skipped AGENTIC_OS edge at line ${token.line} because neither endpoint is declared as a typed node.`)
      continue
    }
    if (!nodeById.has(token.source)) {
      nodeById.set(token.source, makeSemanticNode({
        id: token.source,
        type: 'AgenticOsNode',
        source,
        line: token.line,
        inferredFromEdge: true,
      }))
    }
    if (!nodeById.has(token.target)) {
      nodeById.set(token.target, makeSemanticNode({
        id: token.target,
        type: 'AgenticOsNode',
        source,
        line: token.line,
        inferredFromEdge: true,
      }))
    }
    const edge = makeSemanticEdge({
      source: token.source,
      target: token.target,
      predicate: token.predicate,
      line: token.line,
      raw: token.raw,
      documentSource: source,
    })
    if (!edgeById.has(edge.id)) edgeById.set(edge.id, edge)
  }

  const nodes = Array.from(nodeById.values()).sort((a, b) => a.id.localeCompare(b.id))
  const edges = Array.from(edgeById.values()).sort(
    (a, b) => a.source.localeCompare(b.source) || a.label.localeCompare(b.label) || a.target.localeCompare(b.target),
  )
  if (nodes.length === 0 && edges.length === 0) return null

  const metadata: Record<string, JSONValue> = {
    kind: AGENTIC_OS_SEMANTIC_GRAPH_KIND,
    graphKind: AGENTIC_OS_SEMANTIC_GRAPH_KIND,
    source,
    sourceKind: 'markdown',
    ...(schema ? { agenticOsSchema: schema } : {}),
    ...(declaredNodeTypes.length > 0 ? { agenticOsNodeTypes: declaredNodeTypes } : {}),
    ...(declaredEdgePredicates.length > 0 ? { agenticOsEdgePredicates: declaredEdgePredicates } : {}),
    agenticOsSemanticNodeCount: nodes.length,
    agenticOsSemanticEdgeCount: edges.length,
  }
  const graphDataWithoutKey: GraphData = {
    type: 'Graph',
    context: AGENTIC_OS_SEMANTIC_GRAPH_CONTEXT,
    nodes,
    edges,
    metadata,
  }
  const graphSemanticKey = buildScopedGraphSemanticKey('agentic-os-semantic-markdown', {
    graphData: graphDataWithoutKey,
  })

  return {
    graphData: {
      ...graphDataWithoutKey,
      metadata: {
        ...metadata,
        ...(graphSemanticKey ? { graphSemanticKey } : {}),
      },
    },
    warnings: Array.from(new Set(warnings.filter(Boolean))).sort((a, b) => a.localeCompare(b)),
  }
}

export function mergeAgenticOsSemanticGraphIntoGraphData(args: {
  base: GraphData
  semantic: GraphData | null | undefined
}): GraphData {
  const semantic = args.semantic || null
  if (!semantic) return args.base
  const baseNodes = Array.isArray(args.base.nodes) ? args.base.nodes : []
  const semanticNodes = Array.isArray(semantic.nodes) ? semantic.nodes : []
  const nodes: GraphNode[] = []
  const seenNodeIds = new Set<string>()
  for (const node of semanticNodes) {
    const id = asCleanString(node?.id)
    if (!id || seenNodeIds.has(id)) continue
    seenNodeIds.add(id)
    nodes.push(node)
  }
  for (const node of baseNodes) {
    const id = asCleanString(node?.id)
    if (!id || seenNodeIds.has(id)) continue
    seenNodeIds.add(id)
    nodes.push(node)
  }

  const baseEdges = Array.isArray(args.base.edges) ? args.base.edges : []
  const semanticEdges = Array.isArray(semantic.edges) ? semantic.edges : []
  const edges: GraphEdge[] = []
  const seenEdgeIds = new Set<string>()
  for (const edge of semanticEdges) {
    const id = asCleanString(edge?.id) || `${asCleanString(edge?.source)}:${asCleanString(edge?.label)}:${asCleanString(edge?.target)}`
    if (!id || seenEdgeIds.has(id)) continue
    seenEdgeIds.add(id)
    edges.push(edge)
  }
  for (const edge of baseEdges) {
    const id = asCleanString(edge?.id) || `${asCleanString(edge?.source)}:${asCleanString(edge?.label)}:${asCleanString(edge?.target)}`
    if (!id || seenEdgeIds.has(id)) continue
    seenEdgeIds.add(id)
    edges.push(edge)
  }

  const baseMeta = isRecord(args.base.metadata) ? (args.base.metadata as Record<string, JSONValue>) : {}
  const semanticMeta = isRecord(semantic.metadata) ? (semantic.metadata as Record<string, JSONValue>) : {}
  const graphDataWithoutKey: GraphData = {
    type: args.base.type || semantic.type || 'Graph',
    context: 'agentic-os-semantic-markdown',
    nodes,
    edges,
    metadata: {
      ...baseMeta,
      ...semanticMeta,
      kind: AGENTIC_OS_SEMANTIC_GRAPH_KIND,
      graphKind: AGENTIC_OS_SEMANTIC_GRAPH_KIND,
      baseGraphKind: asCleanString(baseMeta.graphKind || baseMeta.kind) || 'markdown',
    },
  }
  const graphSemanticKey = buildScopedGraphSemanticKey('agentic-os-semantic-merged-markdown', {
    graphData: graphDataWithoutKey,
  })
  return {
    ...graphDataWithoutKey,
    metadata: {
      ...(graphDataWithoutKey.metadata || {}),
      ...(graphSemanticKey ? { graphSemanticKey } : {}),
    },
  }
}
