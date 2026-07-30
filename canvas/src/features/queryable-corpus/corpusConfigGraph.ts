import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { hashText } from '@/features/parsers/hash'

const asJson = (value: unknown): JSONValue => value as JSONValue

const normalizePath = (raw: string): string => String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()

const safeIdPart = (raw: string): string => hashText(String(raw || '').trim()).slice(0, 12)

const sourceNodeId = (sourcePath: string): string => `corpus:source:${safeIdPart(sourcePath)}`

const configNodeId = (sourcePath: string, kind: string, value: string): string =>
  `corpus:config:${kind}:${safeIdPart(`${sourcePath}:${kind}:${value}`)}`

function lineNumberForIndex(text: string, index: number): number {
  if (index <= 0) return 1
  return text.slice(0, index).split('\n').length
}

function createSourceNode(args: { sourcePath: string; text: string }): GraphNode {
  return {
    id: sourceNodeId(args.sourcePath),
    label: args.sourcePath,
    type: 'CorpusSource',
    properties: {
      'corpus:sourcePath': asJson(args.sourcePath),
      'corpus:mediaKind': asJson('data'),
      'corpus:textHash': asJson(hashText(args.text || '')),
      'corpus:parserId': asJson('corpus-config'),
    },
  }
}

function evidenceProperties(args: { sourcePath: string; lineStart: number; confidence?: 'medium' | 'high' }): Record<string, JSONValue> {
  return {
    'evidence:kind': asJson('extracted'),
    'evidence:confidence': asJson(args.confidence || 'medium'),
    'evidence:sourcePath': asJson(args.sourcePath),
    'evidence:lineStart': asJson(args.lineStart),
    'evidence:lineEnd': asJson(args.lineStart),
    'corpus:parserId': asJson('corpus-config'),
  }
}

function pushUniqueNode(nodes: GraphNode[], node: GraphNode, seen: Set<string>): void {
  if (!node.id || seen.has(node.id)) return
  seen.add(node.id)
  nodes.push(node)
}

function pushUniqueEdge(edges: GraphEdge[], edge: GraphEdge, seen: Set<string>): void {
  if (!edge.id || seen.has(edge.id)) return
  seen.add(edge.id)
  edges.push(edge)
}

function addConfigEntity(args: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  seenNodes: Set<string>
  seenEdges: Set<string>
  source: GraphNode
  sourcePath: string
  type: string
  kind: string
  label: string
  edgeLabel: string
  lineStart: number
  confidence?: 'medium' | 'high'
}): void {
  const label = String(args.label || '').trim()
  if (!label) return
  const id = configNodeId(args.sourcePath, args.kind, label)
  pushUniqueNode(args.nodes, {
    id,
    label,
    type: args.type,
    properties: {
      'corpus:sourcePath': asJson(args.sourcePath),
      'corpus:mediaKind': asJson('data'),
      'corpus:lineStart': asJson(args.lineStart),
    },
  }, args.seenNodes)
  pushUniqueEdge(args.edges, {
    id: `corpus:config-edge:${safeIdPart(`${args.source.id}:${args.edgeLabel}:${id}:${args.lineStart}`)}`,
    source: args.source.id,
    target: id,
    label: args.edgeLabel,
    properties: evidenceProperties({ sourcePath: args.sourcePath, lineStart: args.lineStart, confidence: args.confidence }),
  }, args.seenEdges)
}

function collectRegexMatches(text: string, pattern: RegExp): Array<{ value: string; line: number }> {
  const out: Array<{ value: string; line: number }> = []
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const value = String(match[1] || match[2] || match[0] || '').trim()
    if (value) out.push({ value, line: lineNumberForIndex(text, match.index) })
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1
  }
  return out
}

function addPackageJsonEntities(args: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  seenNodes: Set<string>
  seenEdges: Set<string>
  source: GraphNode
  sourcePath: string
  text: string
}): void {
  let parsed: Record<string, unknown> | null = null
  try {
    const raw = JSON.parse(args.text) as unknown
    parsed = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
  } catch {
    parsed = null
  }
  if (!parsed) return
  const packageName = String(parsed.name || '').trim()
  if (packageName) {
    addConfigEntity({ ...args, type: 'CorpusConfigService', kind: 'service', label: packageName, edgeLabel: 'declaresService', lineStart: 1, confidence: 'high' })
  }
  const scripts = parsed.scripts && typeof parsed.scripts === 'object' && !Array.isArray(parsed.scripts) ? Object.keys(parsed.scripts) : []
  for (const script of scripts) {
    addConfigEntity({ ...args, type: 'CorpusConfigScript', kind: 'script', label: script, edgeLabel: 'declaresScript', lineStart: 1 })
  }
  const dependencyRecords = [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]
  for (const rec of dependencyRecords) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue
    for (const dependency of Object.keys(rec)) {
      addConfigEntity({ ...args, type: 'CorpusConfigDependency', kind: 'dependency', label: dependency, edgeLabel: 'declaresDependency', lineStart: 1 })
    }
  }
}

export function parseCorpusConfigGraph(name: string, text: string): { graphData: GraphData; warnings: string[] } {
  const sourcePath = normalizePath(name) || name
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  const source = createSourceNode({ sourcePath, text })
  pushUniqueNode(nodes, source, seenNodes)
  addPackageJsonEntities({ nodes, edges, seenNodes, seenEdges, source, sourcePath, text })

  for (const item of collectRegexMatches(text, /^\s{0,4}(?:name|service|worker|project)\s*[:=]\s*["']?([A-Za-z0-9_.@/-]+)/gmi)) {
    addConfigEntity({ nodes, edges, seenNodes, seenEdges, source, sourcePath, type: 'CorpusConfigService', kind: 'service', label: item.value, edgeLabel: 'declaresService', lineStart: item.line })
  }
  for (const item of collectRegexMatches(text, /^\s*(?:binding|database_name|bucket_name|queue|route|routes|compatibility_date)\s*[:=]\s*["']?([^"'\n#]+)/gmi)) {
    addConfigEntity({ nodes, edges, seenNodes, seenEdges, source, sourcePath, type: 'CorpusConfigBinding', kind: 'binding', label: item.value, edgeLabel: 'declaresBindingOrRoute', lineStart: item.line })
  }
  for (const item of collectRegexMatches(text, /^\s{2,}([A-Za-z0-9_.-]+):\s*(?:$|#)/gm)) {
    addConfigEntity({ nodes, edges, seenNodes, seenEdges, source, sourcePath, type: 'CorpusConfigService', kind: 'service', label: item.value, edgeLabel: 'declaresService', lineStart: item.line })
  }
  for (const item of collectRegexMatches(text, /\bresource\s+"([^"]+)"\s+"([^"]+)"/g)) {
    addConfigEntity({ nodes, edges, seenNodes, seenEdges, source, sourcePath, type: 'CorpusConfigResource', kind: 'resource', label: item.value, edgeLabel: 'declaresResource', lineStart: item.line })
  }

  return {
    graphData: {
      context: 'queryable-corpus',
      type: 'Graph',
      nodes,
      edges,
      metadata: { kind: 'queryable-corpus', parserId: 'corpus-config', sourcePath } as unknown as GraphData['metadata'],
    },
    warnings: nodes.length <= 1 ? [`No infrastructure config entities extracted from ${sourcePath}`] : [],
  }
}
