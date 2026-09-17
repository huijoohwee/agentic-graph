import React from 'react'
import type { GraphData, GraphNode, GraphEdge } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { getRendererPalette } from '@/lib/graph/schema'
import { getAgenticRagContextComparison, getAgenticRagIgnoreFiltersSummary } from '@/lib/graph/jsonld/index'
import {
  buildTokenFrequenciesForNodes,
  getEdgeWeightForStats,
  topTokenList,
  getStatsTokenizationConfig,
} from '@/lib/graph/statsUtils'
import { getNodeBaseFill } from '@/components/GraphCanvas/helpers'
import type { TokensByGraphLayerRow, StatsCommunity, StatsKeywordTerm, TokensForSelectedNode, TokensForSelectedNodes } from '@/features/graph-stats/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { collectGraphKeywordTermStats } from '@/lib/graph/keywordTerms'

const EMPTY_STRING_ARRAY: string[] = []

type UseStatsDerivedDataProps = {
  effectiveGraph: GraphData | null
  data: GraphData | null
  schema: GraphSchema
  tokenCfg: ReturnType<typeof getStatsTokenizationConfig>
  effectiveLod: 'low' | 'medium' | 'high'
  baseTokenCfg: ReturnType<typeof getStatsTokenizationConfig>
  semanticMode: 'document' | 'keyword'
}

export function useStatsDerivedData({
  effectiveGraph,
  data,
  schema,
  tokenCfg,
  effectiveLod,
  baseTokenCfg,
  semanticMode,
}: UseStatsDerivedDataProps) {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId)
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds ?? EMPTY_STRING_ARRAY)

  const maxListItems = effectiveLod === 'low' ? 10 : effectiveLod === 'medium' ? 20 : 50

  const [graphLayerTokenFilter, setGraphLayerTokenFilter] = React.useState<string>('')
  const [graphLayerTokenSort, setGraphLayerTokenSort] = React.useState<'freq' | 'alpha'>('freq')
  const [communityTokenFilter, setCommunityTokenFilter] = React.useState<string>('')
  const [communityTokenSort, setCommunityTokenSort] = React.useState<'freq' | 'alpha'>('freq')

  const datasetStats = React.useMemo(() => {
    const graph = effectiveGraph as GraphData | null
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return { nodeCount: 0, edgeCount: 0, distinctTriples: 0 }
    }
    const nodeCount = graph.nodes.length
    const edgeCount = graph.edges.length
    const triples = new Set<string>()
    graph.edges.forEach(e => {
      const s = String(e.source)
      const t = String(e.target)
      const l = String(e.label ?? '')
      triples.add(`${s}|${l}|${t}`)
    })
    return { nodeCount, edgeCount, distinctTriples: triples.size }
  }, [effectiveGraph])

  const agenticContext = React.useMemo(
    () => getAgenticRagContextComparison(data as GraphData | null),
    [data],
  )
  const datasetIgnoreFilters = React.useMemo(
    () => getAgenticRagIgnoreFiltersSummary(data as GraphData | null),
    [data],
  )

  const similarityEdgeLabel = 'semanticSimilarity'
  const similarityMetricLabel = semanticMode === 'keyword' ? 'PPMI' : 'Cosine'

  const allTokensForStats = React.useMemo(() => {
    const graph = (effectiveGraph || data) as GraphData | null
    if (!graph || !Array.isArray(graph.nodes)) return []
    const nodes = graph.nodes as GraphNode[]
    const cfgNoStopwords: ReturnType<typeof getStatsTokenizationConfig> = {
      textKeys: baseTokenCfg.textKeys,
      minTokenLength: baseTokenCfg.minTokenLength,
      maxTokensPerNode: baseTokenCfg.maxTokensPerNode,
      stopwords: new Set<string>(),
    }
    const { freqByToken } = buildTokenFrequenciesForNodes(nodes, cfgNoStopwords)
    return topTokenList(freqByToken, freqByToken.size)
  }, [baseTokenCfg, data, effectiveGraph])

  const tokensByGraphLayer = React.useMemo<TokensByGraphLayerRow[]>(() => [], [])

  const graphLayerTokensForDropdown = React.useMemo(() => {
    let items = allTokensForStats
    if (graphLayerTokenFilter) {
      const needle = graphLayerTokenFilter.toLowerCase()
      items = items.filter(t => t.token.toLowerCase().includes(needle))
    }
    if (graphLayerTokenSort === 'alpha') {
      const copy = items.slice()
      copy.sort((a, b) => a.token.localeCompare(b.token))
      return copy
    }
    return items
  }, [allTokensForStats, graphLayerTokenFilter, graphLayerTokenSort])

  const communityTokensForDropdown = React.useMemo(() => {
    let items = allTokensForStats
    if (communityTokenFilter) {
      const needle = communityTokenFilter.toLowerCase()
      items = items.filter(t => t.token.toLowerCase().includes(needle))
    }
    if (communityTokenSort === 'alpha') {
      const copy = items.slice()
      copy.sort((a, b) => a.token.localeCompare(b.token))
      return copy
    }
    return items
  }, [allTokensForStats, communityTokenFilter, communityTokenSort])

  const tokensForSelectedNode = React.useMemo<TokensForSelectedNode | null>(() => {
    const graph = effectiveGraph as GraphData | null
    if (!graph || !Array.isArray(graph.nodes) || !selectedNodeId) return null
    const node = (graph.nodes as GraphNode[]).find(n => String(n.id) === String(selectedNodeId)) || null
    if (!node) return null
    const { totalTokens, freqByToken } = buildTokenFrequenciesForNodes([node], tokenCfg)
    return { node, totalTokens, topTokens: topTokenList(freqByToken, maxListItems) }
  }, [effectiveGraph, maxListItems, selectedNodeId, tokenCfg])

  const tokensForSelectedNodes = React.useMemo<TokensForSelectedNodes | null>(() => {
    const graph = effectiveGraph as GraphData | null
    if (!graph || !Array.isArray(graph.nodes)) return null
    const ids = new Set<string>([...(selectedNodeIds || []), ...(selectedNodeId ? [selectedNodeId] : [])].map(String))
    if (ids.size === 0) return null
    const nodes = (graph.nodes as GraphNode[]).filter(n => ids.has(String(n.id)))
    if (nodes.length === 0) return null
    const { totalTokens, freqByToken } = buildTokenFrequenciesForNodes(nodes, tokenCfg)
    return { nodeCount: nodes.length, totalTokens, topTokens: topTokenList(freqByToken, maxListItems) }
  }, [effectiveGraph, maxListItems, selectedNodeId, selectedNodeIds, tokenCfg])

  const semanticEdges = React.useMemo(() => {
    const graph = effectiveGraph as GraphData | null
    if (!graph || !Array.isArray(graph.edges)) return []
    const edges = graph.edges as GraphEdge[]
    if (semanticMode === 'keyword') return edges
    return edges.filter((e) => {
      if (String(e.label ?? '') !== similarityEdgeLabel) return false
      const meta = (e.metadata || {}) as Record<string, unknown>
      return meta.derived === true && meta.kind === 'semantic'
    })
  }, [effectiveGraph, semanticMode, similarityEdgeLabel])

  const selectedEdge = React.useMemo(() => {
    const graph = effectiveGraph as GraphData | null
    if (!graph || !Array.isArray(graph.edges) || !selectedEdgeId) return null
    return (graph.edges as GraphEdge[]).find(e => String(e.id) === String(selectedEdgeId)) || null
  }, [effectiveGraph, selectedEdgeId])

  const selectedEdgeTokenCounts = React.useMemo(() => {
    const graph = effectiveGraph as GraphData | null
    if (!graph || !Array.isArray(graph.nodes) || !selectedEdge) return null
    const srcId = String(selectedEdge.source ?? '')
    const tgtId = String(selectedEdge.target ?? '')
    if (!srcId || !tgtId) return null
    const nodes = graph.nodes as GraphNode[]
    const src = nodes.find(n => String(n.id) === srcId) || null
    const tgt = nodes.find(n => String(n.id) === tgtId) || null
    const list: GraphNode[] = []
    if (src) list.push(src)
    if (tgt && (!src || String(src.id) !== String(tgt.id))) list.push(tgt)
    if (list.length === 0) return null
    const { freqByToken } = buildTokenFrequenciesForNodes(list, tokenCfg)
    return topTokenList(freqByToken, Math.min(24, maxListItems))
  }, [effectiveGraph, maxListItems, selectedEdge, tokenCfg])

  const topSemanticEdges = React.useMemo(() => {
    const edges = semanticEdges.slice()
    edges.sort((a, b) => {
      const aw = getEdgeWeightForStats(a)
      const bw = getEdgeWeightForStats(b)
      const diff = bw - aw
      if (diff !== 0) return diff
      return String(a.id).localeCompare(String(b.id))
    })
    return edges
  }, [semanticEdges])

  const semanticEdgeColor = React.useMemo(() => {
    const byLabel = schema.edgeStyles && similarityEdgeLabel && schema.edgeStyles[similarityEdgeLabel]
      ? schema.edgeStyles[similarityEdgeLabel]?.color
      : null
    const c = typeof byLabel === 'string' ? byLabel.trim() : ''
    if (c) return c
    return getRendererPalette(schema).edges.neutral
  }, [schema, similarityEdgeLabel])

  const neutralBarColor = React.useMemo(() => {
    return getRendererPalette(schema).edges.neutral
  }, [schema])

  const communities = React.useMemo<StatsCommunity[]>(() => {
    const graph = effectiveGraph as GraphData | null
    if (!graph || !Array.isArray(graph.nodes)) return []
    const nodes = graph.nodes as GraphNode[]
    const byCommunity = new Map<number, { id: number; count: number; fill: string; nodes: GraphNode[] }>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const props = (n.properties || {}) as Record<string, unknown>
      const raw = props['visual:community']
      const c =
        typeof raw === 'number'
          ? (Number.isFinite(raw) ? raw : null)
          : (typeof raw === 'string' && raw.trim() ? Number(raw) : null)
      if (c == null || !Number.isFinite(c)) continue
      const fill = typeof props['visual:fill'] === 'string' ? String(props['visual:fill']).trim() : ''
      const entry = byCommunity.get(c) || { id: c, count: 0, fill, nodes: [] }
      entry.count += 1
      if (!entry.fill && fill) entry.fill = fill
      entry.nodes.push(n)
      byCommunity.set(c, entry)
    }
    
    const list = Array.from(byCommunity.values()).map((group) => {
      const { freqByToken } = buildTokenFrequenciesForNodes(group.nodes, tokenCfg)
      const topTokens = topTokenList(freqByToken, Math.min(12, maxListItems))
      const name = topTokens.length > 0
        ? topTokens.slice(0, Math.min(2, topTokens.length)).map(t => t.token).join(' · ')
        : `Community ${String(group.id)}`
      const description = topTokens.length > 0
        ? topTokens.slice(0, Math.min(5, topTokens.length)).map(t => `${t.token}(${t.count})`).join(', ')
        : ''
      const derivedFill = group.fill || (group.nodes.length ? getNodeBaseFill(group.nodes[0], schema) : '')
      return {
        id: group.id,
        count: group.count,
        fill: derivedFill || getRendererPalette(schema).nodes.execution,
        nodeIds: group.nodes.map(n => String(n.id)),
        name,
        description,
        topTokens,
      }
    })
    
    list.sort((a, b) => {
      const diff = b.count - a.count
      if (diff !== 0) return diff
      return a.id - b.id
    })
    return list
  }, [effectiveGraph, maxListItems, schema, tokenCfg])

  const dashboardKeywordTerms = React.useMemo<StatsKeywordTerm[]>(() => {
    return collectGraphKeywordTermStats(effectiveGraph)
  }, [effectiveGraph])

  return {
    datasetStats,
    agenticContext,
    datasetIgnoreFilters,
    tokensByGraphLayer,
    graphLayerTokensForDropdown,
    graphLayerTokenFilter,
    setGraphLayerTokenFilter,
    graphLayerTokenSort,
    setGraphLayerTokenSort,
    communityTokensForDropdown,
    communityTokenFilter,
    setCommunityTokenFilter,
    communityTokenSort,
    setCommunityTokenSort,
    tokensForSelectedNode,
    tokensForSelectedNodes,
    selectedEdge,
    selectedEdgeTokenCounts,
    dashboardKeywordTerms,
    topSemanticEdges,
    semanticEdgeColor,
    neutralBarColor,
    communities,
    similarityMetricLabel,
  }
}
