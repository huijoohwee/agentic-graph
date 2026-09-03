import type { GraphData } from '@/lib/graph/types'
import { parseGraphFromJson } from '@/lib/graph/io/adapter'
import { buildMarkdownJsonLd } from '@/features/parsers/markdownJsonLd'
import { parseJsonLd } from '@/lib/graph/jsonld'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import {
  normalizeFlowchartApiGraphData,
  parseFlowchartApiGraphPayload,
} from '@/lib/flowchart'
import { buildFlowchartSourceMeta } from '@/lib/flowchart/source'
import { containsFrontmatterMermaid } from 'grph-shared/markdown/mermaidInput'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'
import { LRUCache } from '@/lib/cache/LRUCache'
import {
  mergeAgenticOsSemanticGraphIntoGraphData,
  parseAgenticOsSemanticGraphFromMarkdown,
} from '@/features/parsers/agenticOsSemanticGraph'
import { strybldrStoryboardSpec } from '@/features/strybldr/parserSpecs'

export const WORKSPACE_GRAPH_CONTEXT = 'workspace:graph'
export const WORKSPACE_GRAPH_SOURCE = 'workspace:graph'
export const WORKSPACE_GRAPH_PARSE_HINT = 'workspace:inline-data'
export const WORKSPACE_GRAPH_SOURCE_KIND = 'workspace'

const workspaceJsonGraphParseCache = new LRUCache<string, { graphData: GraphData | null }>(32)
const workspaceFrontmatterFlowParseCache = new LRUCache<string, { graphData: GraphData | null }>(32)
const workspaceFrontmatterMermaidParseCache = new LRUCache<string, { graphData: GraphData | null }>(32)
const workspaceAgenticOsSemanticGraphParseCache = new LRUCache<string, { graphData: GraphData | null }>(32)
const workspaceStrybldrStoryboardParseCache = new LRUCache<string, { graphData: GraphData | null }>(32)
export const WORKSPACE_STRUCTURED_PARSE_DEBOUNCE_MS = 120

const buildWorkspaceStructuredParseKey = (args: {
  parseKind: 'json-graph' | 'frontmatter-flow' | 'frontmatter-mermaid' | 'agentic-os-semantic' | 'strybldr-storyboard'
  markdownName: string | null
  markdownText: string | null
}): string => {
  return buildSourceFileParseIdentityHash({
    cacheNamespace: `workspace:${args.parseKind}`,
    name: String(args.markdownName || ''),
    text: String(args.markdownText || ''),
  })
}

const asFinite = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''))

const toWorkspaceJsonGraphData = (data: GraphData): GraphData | null => {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : []
  const edges = Array.isArray(data?.edges) ? data.edges : []
  if (nodes.length === 0 && edges.length === 0) return null
  const typeCounts = nodes.reduce(
    (acc, n) => {
      const t = String(n?.type || '').toLowerCase()
      if (t === 'problem') acc.problem += 1
      if (t === 'solution') acc.solution += 1
      return acc
    },
    { problem: 0, solution: 0 },
  )
  const isFlowchart = typeCounts.problem > 0 && typeCounts.solution > 0
  const meta =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const source =
    typeof meta.source === 'string' && meta.source.trim()
      ? meta.source
      : WORKSPACE_GRAPH_SOURCE
  const sourceKind =
    typeof meta.sourceKind === 'string' && meta.sourceKind.trim()
      ? meta.sourceKind
      : WORKSPACE_GRAPH_SOURCE_KIND
  const graphKind =
    typeof meta.graphKind === 'string' && meta.graphKind.trim()
      ? meta.graphKind
      : isFlowchart
        ? 'flowchart'
        : 'graph'
  return {
    ...data,
    type: data.type || 'apiGraph',
    context: data.context || source,
    metadata: {
      ...meta,
      source,
      sourceKind,
      graphKind,
    } as Record<string, any>,
  }
}

const withWorkspaceMarkdownSourceMetadata = (args: {
  graphData: GraphData
  markdownName: string | null
  fallbackSourceKind: string
}): GraphData => {
  const name = String(args.markdownName || '').trim()
  const metadata = args.graphData.metadata && typeof args.graphData.metadata === 'object' && !Array.isArray(args.graphData.metadata)
    ? (args.graphData.metadata as Record<string, any>)
    : {}
  const frontmatterMeta = metadata.frontmatterMeta && typeof metadata.frontmatterMeta === 'object' && !Array.isArray(metadata.frontmatterMeta)
    ? (metadata.frontmatterMeta as Record<string, unknown>)
    : null
  const sourceKind =
    typeof metadata.sourceKind === 'string' && metadata.sourceKind.trim()
      ? metadata.sourceKind.trim()
      : typeof frontmatterMeta?.sourceKind === 'string' && frontmatterMeta.sourceKind.trim()
        ? frontmatterMeta.sourceKind.trim()
        : args.fallbackSourceKind
  return {
    ...args.graphData,
    metadata: {
      ...metadata,
      ...(name ? { source: `markdown:${name}`, markdownDocumentName: name } : {}),
      sourceKind,
    } as GraphData['metadata'],
  }
}

const parseWorkspaceJsonGraphData = (args: { markdownName: string | null; markdownText: string | null }): GraphData | null => {
  const rawText = String(args.markdownText || '')
  const trimmed = rawText.trim()
  if (!trimmed) return null
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[')
  if (!looksJson) return null

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed)) {
      const flowchartPayload = parseFlowchartApiGraphPayload(parsed)
      if (flowchartPayload) {
        return normalizeFlowchartApiGraphData({
          payload: flowchartPayload,
          sourceMeta: buildFlowchartSourceMeta({
            kind: 'workspace',
            documentName: args.markdownName,
          }),
        })
      }
    }
    const obj = Array.isArray(parsed) ? null : (parsed as Record<string, unknown>)
    const nodesRaw = obj && Array.isArray(obj.nodes) ? obj.nodes : null
    const edgesRaw = obj && Array.isArray(obj.edges) ? obj.edges : null
    if (!nodesRaw || !edgesRaw) {
      const parsedGraph = parseGraphFromJson(args.markdownName || WORKSPACE_GRAPH_PARSE_HINT, parsed, {
        textForGeoJsonTextFallback: trimmed,
      }).data
      return toWorkspaceJsonGraphData(parsedGraph)
    }

    const nodes = nodesRaw
      .map((n): GraphData['nodes'][number] | null => {
        if (!n || typeof n !== 'object' || Array.isArray(n)) return null
        const o = n as Record<string, unknown>
        const id = asStr(o.id).trim()
        if (!id) return null
        const type = asStr(o.type).trim() || 'node'
        const label = asStr(o.label).trim() || id
        const x = asFinite(o.x)
        const y = asFinite(o.y)
        const props: Record<string, unknown> = {}
        Object.keys(o).forEach(k => {
          if (k === 'id' || k === 'type' || k === 'label' || k === 'x' || k === 'y') return
          props[k] = o[k]
        })
        return {
          id,
          type,
          label,
          ...(x != null ? { x } : {}),
          ...(y != null ? { y } : {}),
          properties: props as Record<string, any>,
        }
      })
      .filter(Boolean) as GraphData['nodes']

    const nodeIdSet = new Set(nodes.map(n => String(n.id)))
    const edges = edgesRaw
      .map((e): GraphData['edges'][number] | null => {
        if (!e || typeof e !== 'object' || Array.isArray(e)) return null
        const o = e as Record<string, unknown>
        const source = asStr(o.source || o.problem_id).trim()
        const target = asStr(o.target || o.solution_id).trim()
        if (!source || !target) return null
        if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) return null
        const id = asStr(o.id).trim() || `${source}->${target}`
        const strength = asFinite(o.strength)
        const props: Record<string, unknown> = {}
        Object.keys(o).forEach(k => {
          if (k === 'id' || k === 'source' || k === 'target' || k === 'problem_id' || k === 'solution_id') return
          props[k] = o[k]
        })
        if (strength != null) props.strength = strength
        return {
          id,
          source,
          target,
          label: asStr(o.label).trim() || 'linksTo',
          properties: props as Record<string, any>,
        }
      })
      .filter(Boolean) as GraphData['edges']

    if (nodes.length === 0) {
      const parsedGraph = parseGraphFromJson(args.markdownName || WORKSPACE_GRAPH_PARSE_HINT, parsed, {
        textForGeoJsonTextFallback: trimmed,
      }).data
      return toWorkspaceJsonGraphData(parsedGraph)
    }
    return toWorkspaceJsonGraphData({
      type: 'apiGraph',
      context: WORKSPACE_GRAPH_CONTEXT,
      metadata: {
        source: WORKSPACE_GRAPH_SOURCE,
        sourceKind: WORKSPACE_GRAPH_SOURCE_KIND,
      } as Record<string, any>,
      nodes,
      edges,
    })
  } catch {
    return null
  }
}

export const parseWorkspaceJsonGraphDataCached = (args: { markdownName: string | null; markdownText: string | null }): GraphData | null => {
  const key = buildWorkspaceStructuredParseKey({
    parseKind: 'json-graph',
    markdownName: args.markdownName,
    markdownText: args.markdownText,
  })
  const cached = workspaceJsonGraphParseCache.get(key)
  if (cached) return cached.graphData
  const graphData = parseWorkspaceJsonGraphData(args)
  workspaceJsonGraphParseCache.set(key, { graphData })
  return graphData
}

export const parseWorkspaceFrontmatterFlowGraphDataCached = (args: {
  markdownName: string | null
  markdownText: string | null
}): GraphData | null => {
  const text = String(args.markdownText || '')
  if (!text.trim()) return null
  const key = buildWorkspaceStructuredParseKey({
    parseKind: 'frontmatter-flow',
    markdownName: args.markdownName,
    markdownText: args.markdownText,
  })
  const cached = workspaceFrontmatterFlowParseCache.get(key)
  if (cached) return cached.graphData
  let graphData: GraphData | null = null
  try {
    const parsed = tryParseMarkdownFrontmatterFlowGraph(args.markdownName || 'workspace:frontmatter-flow.md', text)
    graphData = parsed?.graphData
      ? withWorkspaceMarkdownSourceMetadata({
          graphData: parsed.graphData,
          markdownName: args.markdownName,
          fallbackSourceKind: 'frontmatter-flow',
        })
      : null
  } catch {
    graphData = null
  }
  workspaceFrontmatterFlowParseCache.set(key, { graphData })
  return graphData
}

export const parseWorkspaceStrybldrStoryboardGraphDataCached = (args: {
  markdownName: string | null
  markdownText: string | null
}): GraphData | null => {
  const text = String(args.markdownText || '')
  if (!text.trim()) return null
  if (!strybldrStoryboardSpec.match(args.markdownName || 'workspace:strybldr-storyboard.md', text)) return null
  const key = buildWorkspaceStructuredParseKey({
    parseKind: 'strybldr-storyboard',
    markdownName: args.markdownName,
    markdownText: args.markdownText,
  })
  const cached = workspaceStrybldrStoryboardParseCache.get(key)
  if (cached) return cached.graphData
  let graphData: GraphData | null = null
  try {
    const parsed = strybldrStoryboardSpec.parse(args.markdownName || 'workspace:strybldr-storyboard.md', text)
    const parsedGraphData = parsed?.graphData
    const hasParsedGraph =
      (Array.isArray(parsedGraphData?.nodes) && parsedGraphData.nodes.length > 0)
      || (Array.isArray(parsedGraphData?.edges) && parsedGraphData.edges.length > 0)
    const frontmatterFlowGraphData = hasParsedGraph
      ? null
      : tryParseMarkdownFrontmatterFlowGraph(args.markdownName || 'workspace:frontmatter-flow.md', text)?.graphData || null
    graphData = parsedGraphData && (hasParsedGraph || !frontmatterFlowGraphData)
      ? withWorkspaceMarkdownSourceMetadata({
          graphData: parsedGraphData,
          markdownName: args.markdownName,
          fallbackSourceKind: 'strybldr-storyboard',
        })
      : null
  } catch {
    graphData = null
  }
  workspaceStrybldrStoryboardParseCache.set(key, { graphData })
  return graphData
}

export const parseWorkspaceAgenticOsSemanticGraphDataCached = (args: {
  markdownName: string | null
  markdownText: string | null
}): GraphData | null => {
  const text = String(args.markdownText || '')
  if (!text.trim()) return null
  const key = buildWorkspaceStructuredParseKey({
    parseKind: 'agentic-os-semantic',
    markdownName: args.markdownName,
    markdownText: args.markdownText,
  })
  const cached = workspaceAgenticOsSemanticGraphParseCache.get(key)
  if (cached) return cached.graphData
  let graphData: GraphData | null = null
  try {
    const semantic = parseAgenticOsSemanticGraphFromMarkdown({
      name: args.markdownName || 'workspace:agentic-os-semantic.md',
      text,
    })
    if (semantic) {
      const jsonld = buildMarkdownJsonLd(args.markdownName || 'workspace:agentic-os-semantic.md', text)
      const parsed = parseJsonLd(jsonld)
      graphData = toWorkspaceJsonGraphData(
        mergeAgenticOsSemanticGraphIntoGraphData({
          base: parsed,
          semantic: semantic.graphData,
        }),
      )
    }
  } catch {
    graphData = null
  }
  workspaceAgenticOsSemanticGraphParseCache.set(key, { graphData })
  return graphData
}

export const parseWorkspaceFrontmatterMermaidGraphDataCached = (args: {
  markdownName: string | null
  markdownText: string | null
}): GraphData | null => {
  const text = String(args.markdownText || '')
  if (!text.trim()) return null
  if (!containsFrontmatterMermaid(text)) return null
  const key = buildWorkspaceStructuredParseKey({
    parseKind: 'frontmatter-mermaid',
    markdownName: args.markdownName,
    markdownText: args.markdownText,
  })
  const cached = workspaceFrontmatterMermaidParseCache.get(key)
  if (cached) return cached.graphData
  let graphData: GraphData | null = null
  try {
    const jsonld = buildMarkdownJsonLd(args.markdownName || 'workspace:frontmatter.md', text)
    const parsed = parseJsonLd(jsonld)
    graphData = toWorkspaceJsonGraphData(parsed)
  } catch {
    graphData = null
  }
  workspaceFrontmatterMermaidParseCache.set(key, { graphData })
  return graphData
}
