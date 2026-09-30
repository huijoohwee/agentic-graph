import type { GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import type { TextEntity, TextTriple } from '@/lib/graph/textAnalysis'
import { tokenizeForStats } from '@/lib/graph/statsUtils'
import { KEYWORD_FUNCTION_WORDS } from '@/features/semantic-mode/keywordStopwords'
import { computeConnectedComponents, computePageRank, computeHITS } from '@/features/semantic-mode/graphAlgorithms'
import { computePpmi, deriveEdgeWidthFromStrength } from '@/features/semantic-mode/association'
import { computeDbscanCommunities } from '@/features/semantic-mode/densityClustering'
import type { DensityClusteringConfig } from '@/features/semantic-mode/densityClustering'
import {
  buildUndirectedNeighbors,
  computeBetweennessCentrality,
  computeClosenessCentrality,
  computeClusteringCoefficient,
  computeGraphDensity,
  computeShortestPathStats,
} from '@/features/semantic-mode/graphMetrics'
import { nowMs } from '@/lib/graph/graphragTextToyStages'
import { normalizeWhitespace, splitSentencesWithOffsets } from '@/lib/graph/textAnalysis'
import { DEFAULT_GRAPHRAG_TEXT_CENTRALITY_CONFIG, type GraphRagTextCentralityConfig } from '@/lib/graph/graphragTextConfig'

const clampNumber = (v: number, min: number, max: number): number => {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

export type GraphRagTextGraphMetrics = {
  nodeCount: number
  edgeCount: number
  density: number
  avgDegree: number
  communities: number
  diameter: number
  avgPathLength: number
  clusteringCoefficient: number
}

export type GraphRagTextAnalyticsOutputs = {
  entityOutput: JSONValue
  relationOutput: JSONValue
  metadataOutput: JSONValue
  clusterOutput: JSONValue
  graphMetrics: GraphRagTextGraphMetrics
  timings: { entityMs: number; relationMs: number; metadataMs: number; clusterMs: number }
}

export function applyGraphRagTextAnalytics(args: {
  text: string
  entities: TextEntity[]
  triples: TextTriple[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeKeyById: Map<string, string>
  densityClustering?: Partial<DensityClusteringConfig>
  centrality?: Partial<GraphRagTextCentralityConfig>
}): GraphRagTextAnalyticsOutputs {
  const baseText = String(args.text || '')
  const sentenceRanges = splitSentencesWithOffsets(baseText)
  const normalizeKey = (value: string): string => normalizeWhitespace(value).toLowerCase()

  const entityMentionCountByKey = new Map<string, number>()
  const dfByKey = new Map<string, number>()
  const entityBlockCounts = new Map<string, number>()
  const pairCounts = new Map<string, number>()

  if (sentenceRanges.length > 0 && args.entities.length > 0) {
    let mIdx = 0
    const sortedEntities = [...args.entities].sort((a, b) => a.start - b.start)
    for (let sIdx = 0; sIdx < sentenceRanges.length; sIdx += 1) {
      const r = sentenceRanges[sIdx]!
      const bucket: TextEntity[] = []
      while (mIdx < sortedEntities.length) {
        const m = sortedEntities[mIdx]!
        const mid = (m.start + m.end) / 2
        if (mid < r.start) {
          mIdx += 1
          continue
        }
        if (mid > r.end) break
        bucket.push(m)
        mIdx += 1
      }
      const uniqueKeys = new Set<string>()
      for (let bi = 0; bi < bucket.length; bi += 1) {
        const k = normalizeKey(String(bucket[bi]!.text || ''))
        if (!k) continue
        uniqueKeys.add(k)
        entityMentionCountByKey.set(k, (entityMentionCountByKey.get(k) || 0) + 1)
      }
      uniqueKeys.forEach(k => {
        dfByKey.set(k, (dfByKey.get(k) || 0) + 1)
        entityBlockCounts.set(k, (entityBlockCounts.get(k) || 0) + 1)
      })
      const uniq = Array.from(uniqueKeys).sort((a, b) => a.localeCompare(b))
      for (let i = 0; i < uniq.length; i += 1) {
        for (let j = i + 1; j < uniq.length; j += 1) {
          const a = uniq[i]!
          const b = uniq[j]!
          pairCounts.set(`${a}|${b}`, (pairCounts.get(`${a}|${b}`) || 0) + 1)
        }
      }
    }
  } else {
    for (let i = 0; i < args.entities.length; i += 1) {
      const k = normalizeKey(String(args.entities[i]!.text || ''))
      if (!k) continue
      entityMentionCountByKey.set(k, (entityMentionCountByKey.get(k) || 0) + 1)
    }
  }

  for (let i = 0; i < args.triples.length; i += 1) {
    const t = args.triples[i]!
    const a = normalizeKey(String(t.subject || ''))
    const b = normalizeKey(String(t.object || ''))
    if (!a || !b) continue
    const pairKey = a.localeCompare(b) < 0 ? `${a}|${b}` : `${b}|${a}`
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 3)
  }

  const ppmi = computePpmi({ pairCounts, entityBlockCounts, blockCount: sentenceRanges.length })

  const nodeIds = args.nodes.map(n => String(n.id)).filter(Boolean)
  const undirectedNeighbors = buildUndirectedNeighbors({ nodeIds, edges: args.edges })

  const centralityCfg: GraphRagTextCentralityConfig = {
    ...DEFAULT_GRAPHRAG_TEXT_CENTRALITY_CONFIG,
    ...(args.centrality || {}),
  }

  const entityT0 = nowMs()
  const pr = centralityCfg.pagerank
    ? computePageRank({ nodeIds, neighbors: undirectedNeighbors, iterations: 24, damping: 0.85 })
    : new Map<string, number>()
  const hits = centralityCfg.hits
    ? computeHITS({ nodeIds, edges: args.edges, iterations: 24 })
    : { hubs: new Map<string, number>(), authorities: new Map<string, number>() }
  const bet = centralityCfg.betweenness
    ? computeBetweennessCentrality({ nodeIds, undirectedNeighbors, maxNodes: 140, maxSteps: 200_000 })
    : new Map<string, number>()
  const close = centralityCfg.closeness
    ? computeClosenessCentrality({ nodeIds, undirectedNeighbors, maxNodes: 140, maxSteps: 200_000 })
    : new Map<string, number>()
  const entityT1 = nowMs()

  const docCount = Math.max(1, sentenceRanges.length)
  const scoreRows: Array<{ label: string; freq: number; tfidf: number; pagerank: number; hubs: number; authorities: number; closeness: number }> = []
  for (let i = 0; i < args.nodes.length; i += 1) {
    const n = args.nodes[i]!
    const id = String(n.id || '')
    const key = args.nodeKeyById.get(id) || ''
    const freq = entityMentionCountByKey.get(key) || 0
    const df = dfByKey.get(key) || 0
    const idf = Math.log((docCount + 1) / (df + 1)) + 1
    const tfidf = freq * idf
    const rank = pr.get(id) || 0
    const hub = hits.hubs.get(id) || 0
    const auth = hits.authorities.get(id) || 0
    const betw = bet.get(id) || 0
    const cls = close.get(id) || 0
    const degree = (undirectedNeighbors.get(id) || []).length
    const importance = freq + tfidf * 0.25 + rank * 10 + betw * 4 + auth * 5 + cls * 2
    const nodeSize = clampNumber(Math.sqrt(Math.max(0, importance)) * 2, 10, 40)
    const nextProps: Record<string, JSONValue> = {
      ...((n.properties || {}) as Record<string, JSONValue>),
      'keyword:frequency': freq as unknown as JSONValue,
      'graphrag:tfidf': tfidf as unknown as JSONValue,
      'graphrag:degree': degree as unknown as JSONValue,
      'visual:importance': importance as unknown as JSONValue,
      'visual:nodeSize': nodeSize as unknown as JSONValue,
    }
    if (centralityCfg.pagerank) nextProps['graphrag:pagerank'] = rank as unknown as JSONValue
    if (centralityCfg.hits) {
      nextProps['graphrag:hubs'] = hub as unknown as JSONValue
      nextProps['graphrag:authorities'] = auth as unknown as JSONValue
    }
    if (centralityCfg.betweenness) nextProps['graphrag:betweenness'] = betw as unknown as JSONValue
    if (centralityCfg.closeness) nextProps['graphrag:closeness'] = cls as unknown as JSONValue
    n.properties = nextProps
    scoreRows.push({ label: String(n.label || ''), freq, tfidf, pagerank: rank, hubs: hub, authorities: auth, closeness: cls })
  }

  scoreRows.sort((a, b) => {
    const sa = a.freq + a.tfidf * 0.25 + a.pagerank * 10
    const sb = b.freq + b.tfidf * 0.25 + b.pagerank * 10
    if (sb !== sa) return sb - sa
    return a.label.localeCompare(b.label)
  })
  const entityOutput = {
    centrality: centralityCfg as unknown as JSONValue,
    keywords: scoreRows.slice(0, 10).map(r => {
      const row: Record<string, JSONValue> = {
        entity: r.label,
        freq: r.freq as unknown as JSONValue,
        tfidf: Number(r.tfidf.toFixed(3)) as unknown as JSONValue,
      }
      if (centralityCfg.pagerank) row.pagerank = Number(r.pagerank.toFixed(3)) as unknown as JSONValue
      if (centralityCfg.hits) {
        row.hubs = Number(r.hubs.toFixed(3)) as unknown as JSONValue
        row.authorities = Number(r.authorities.toFixed(3)) as unknown as JSONValue
      }
      if (centralityCfg.closeness) row.closeness = Number(r.closeness.toFixed(3)) as unknown as JSONValue
      return row as unknown as JSONValue
    }),
  } as unknown as JSONValue

  const relT0 = nowMs()
  let sumCausality = 0
  let sumStrength = 0
  for (let i = 0; i < args.edges.length; i += 1) {
    const e = args.edges[i]!
    const sKey = args.nodeKeyById.get(String(e.source)) || ''
    const tKey = args.nodeKeyById.get(String(e.target)) || ''
    const pairKey = sKey && tKey && sKey.localeCompare(tKey) < 0 ? `${sKey}|${tKey}` : `${tKey}|${sKey}`
    const count = pairCounts.get(pairKey) || 0
    const weight = ppmi.get(pairKey) || 0

    const props = (e.properties || {}) as Record<string, unknown>
    const causal = typeof props.causalityStrength === 'number' ? (props.causalityStrength as number) : 0
    const temporal = typeof props.temporalStrength === 'number' ? (props.temporalStrength as number) : 0
    const certainty = typeof props.certainty === 'number' ? (props.certainty as number) : 0.6
    const neg = props.negation === true
    const causalityScore = clampNumber((0.6 * causal + 0.2 * temporal + 0.2 * certainty) * (neg ? 0.4 : 1), 0, 1)
    const edgeStrength = clampNumber(weight / 3, 0, 1)
    const width = clampNumber(deriveEdgeWidthFromStrength({ count, weight }) * (0.7 + causalityScore * 0.6), 1, 10)

    e.properties = {
      ...(e.properties || {}),
      'strength:count': count as unknown as JSONValue,
      'strength:ppmi': weight as unknown as JSONValue,
      'strength:score': edgeStrength as unknown as JSONValue,
      'causality:why': clampNumber(causal, 0, 1) as unknown as JSONValue,
      'causality:temporal': clampNumber(temporal, 0, 1) as unknown as JSONValue,
      'causality:modality': clampNumber(certainty, 0, 1) as unknown as JSONValue,
      'causality:negation': (neg ? true : false) as unknown as JSONValue,
      'causality:score': causalityScore as unknown as JSONValue,
      'visual:weight': weight as unknown as JSONValue,
      'visual:width': width as unknown as JSONValue,
    }
    sumCausality += causalityScore
    sumStrength += edgeStrength
  }
  const relT1 = nowMs()
  const relationOutput = {
    edges: args.edges.length,
    avg_causality: args.edges.length > 0 ? Number((sumCausality / args.edges.length).toFixed(3)) : 0,
    avg_strength: args.edges.length > 0 ? Number((sumStrength / args.edges.length).toFixed(3)) : 0,
  } as unknown as JSONValue

  const metaT0 = nowMs()
  const nodeCount = args.nodes.length
  const edgeCount = args.edges.length
  const density = computeGraphDensity(nodeCount, edgeCount)
  const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0
  const clusteringCoefficient = computeClusteringCoefficient({ nodeIds, undirectedNeighbors })
  const sp = computeShortestPathStats({ nodeIds, undirectedNeighbors, maxNodes: 140, maxSteps: 200_000 })
  const metadataOutput = {
    density: Number(density.toFixed(3)),
    diameter: sp.diameter,
    avg_path_length: Number(sp.avgPathLength.toFixed(3)),
    clustering_coefficient: Number(clusteringCoefficient.toFixed(3)),
  } as unknown as JSONValue
  const metaT1 = nowMs()

  const clusterT0 = nowMs()
  const vectorByNodeId = new Map<string, Map<string, number>>()
  for (let i = 0; i < args.nodes.length; i += 1) {
    const n = args.nodes[i]!
    const id = String(n.id || '')
    if (!id) continue
    const vec = new Map<string, number>()
    const labelTokens = tokenizeForStats(String(n.label || ''), 3, KEYWORD_FUNCTION_WORDS)
    for (let t = 0; t < labelTokens.length; t += 1) {
      const tok = labelTokens[t]!
      vec.set(tok, (vec.get(tok) || 0) + 1)
    }
    vectorByNodeId.set(id, vec)
  }
  for (let i = 0; i < args.edges.length; i += 1) {
    const e = args.edges[i]!
    const s = String(e.source || '')
    const t = String(e.target || '')
    if (!s || !t) continue
    const edgeTokens = tokenizeForStats(String(e.label || ''), 3, KEYWORD_FUNCTION_WORDS)
    for (let k = 0; k < edgeTokens.length; k += 1) {
      const tok = edgeTokens[k]!
      const sVec = vectorByNodeId.get(s) || new Map<string, number>()
      sVec.set(tok, (sVec.get(tok) || 0) + 0.5)
      vectorByNodeId.set(s, sVec)
      const tVec = vectorByNodeId.get(t) || new Map<string, number>()
      tVec.set(tok, (tVec.get(tok) || 0) + 0.5)
      vectorByNodeId.set(t, tVec)
    }
  }

  const dbscan = computeDbscanCommunities({ nodeIds, vectorByNodeId, config: args.densityClustering })
  const componentIds = computeConnectedComponents({ nodeIds, undirectedNeighbors })
  let maxDb = 0
  dbscan.forEach(v => { if (v > maxDb) maxDb = v })
  const communityByNodeId = new Map<string, number>()
  nodeIds.forEach((id) => {
    const cid = dbscan.get(id)
    if (typeof cid === 'number') {
      communityByNodeId.set(id, Math.max(0, cid - 1))
      return
    }
    const fallback = componentIds.get(id)
    if (typeof fallback === 'number') communityByNodeId.set(id, maxDb + fallback)
  })

  const communityUnique = new Set(communityByNodeId.values())
  args.nodes.forEach((n) => {
    const cid = communityByNodeId.get(String(n.id))
    if (cid == null) return
    n.properties = {
      ...(n.properties || {}),
      'visual:community': cid as unknown as JSONValue,
      'visual:layer': cid as unknown as JSONValue,
    }
  })
  args.edges.forEach((e) => {
    const sCid = communityByNodeId.get(String(e.source))
    const tCid = communityByNodeId.get(String(e.target))
    if (sCid == null || tCid == null) return
    if (sCid !== tCid) return
    e.properties = { ...(e.properties || {}), 'visual:layer': sCid as unknown as JSONValue }
  })

  const clusterTokenCounts = new Map<number, Map<string, number>>()
  args.nodes.forEach((n) => {
    const cid = communityByNodeId.get(String(n.id))
    if (cid == null) return
    const toks = tokenizeForStats(String(n.label || ''), 3, KEYWORD_FUNCTION_WORDS)
    const m = clusterTokenCounts.get(cid) || new Map<string, number>()
    toks.forEach(tok => m.set(tok, (m.get(tok) || 0) + 1))
    clusterTokenCounts.set(cid, m)
  })
  const clusters = Array.from(communityUnique.values()).sort((a, b) => a - b).map((cid) => {
    const m = clusterTokenCounts.get(cid) || new Map<string, number>()
    const top = Array.from(m.entries()).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).slice(0, 3)
    return { id: cid, top_keywords: top.map(([token]) => token) }
  })
  const clusterOutput = {
    communities: clusters.length,
    clusters,
  } as unknown as JSONValue
  const clusterT1 = nowMs()

  const graphMetrics: GraphRagTextGraphMetrics = {
    nodeCount,
    edgeCount,
    density,
    avgDegree,
    communities: communityUnique.size,
    diameter: sp.diameter,
    avgPathLength: sp.avgPathLength,
    clusteringCoefficient,
  }

  return {
    entityOutput,
    relationOutput,
    metadataOutput,
    clusterOutput,
    graphMetrics,
    timings: {
      entityMs: entityT1 - entityT0,
      relationMs: relT1 - relT0,
      metadataMs: metaT1 - metaT0,
      clusterMs: clusterT1 - clusterT0,
    },
  }
}
