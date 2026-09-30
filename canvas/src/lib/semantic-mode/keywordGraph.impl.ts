import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { hashText } from '@/features/parsers/hash'
import { MVP_COLOR_PALETTE } from '@/lib/graph/schema'
import { computePageRank } from '@/features/semantic-mode/graphAlgorithms'
import { computePpmi, deriveEdgeWidthFromStrength } from '@/features/semantic-mode/association'
import { NLTK_STOPWORDS_EN_SET } from '@/features/semantic-mode/keywordStopwords'
import {
  extractMentionsRobust,
  extractTriplesHeuristic,
  extractCooccurrencePairs,
  splitSentencesWithOffsets,
  isVerbLike,
  normalizeEntityKey,
  type TextEntity,
} from '@/lib/graph/textAnalysis'
import {
  compressCommunityLabels,
  computeLabelPropagationCommunities,
  type WeightedNeighbor,
} from './keywordCommunities'
import {
  buildKeywordCandidateMentions,
  extractDocumentKeywordCandidates,
  type DocumentKeywordCandidate,
} from './keywordExtraction'
import { computeKeywordCloudPlacements } from './keywordCloudLayout'
import { readKeywordGraphMaxNodes, selectRetainedKeywordEntityKeys } from './keywordGraphRetention'
import { withGraphTopologyMetadata } from '@/lib/graph/graphTopology'
import { KEYWORD_GRAPH_ALGO_VERSION, type KeywordGraphResult } from './keywordGraphCache'
import type { MarkdownAnnotation } from '@/lib/markdown/markdownSigil'
import { countHighlightedKeywordNodes, readKeywordAnnotationPropertiesByKey } from './keywordGraphAnnotations'

export type KeywordGraphSource = {
  documentId: string
  documentText: string
  sourceLabel?: string
  sourceTextHash?: string
  markdownAnnotations?: MarkdownAnnotation[]
  tuning?: {
    edgesPerNode?: number
    maxEdgesCap?: number
    maxNodes?: number
  }
}

const clampNumber = (v: number, min: number, max: number): number => {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

const keywordNodeSizeFromCount = (count: number): number => {
  const c = Number.isFinite(count) ? Math.max(0, count) : 0
  const radius = 8 + Math.sqrt(c) * 4
  return clampNumber(radius, 10, 40)
}

const KEYWORD_ROLE_COLORS = {
  subject: MVP_COLOR_PALETTE.nodes.idea,
  object: MVP_COLOR_PALETTE.nodes.execution,
  entity: MVP_COLOR_PALETTE.nodes.idea,
} as const

type Mention = {
  key: string
  label: string
  start: number
  end: number
  ner?: string
}

const prettyLabel = (key: string): string => {
  const t = String(key || '').trim()
  if (!t) return ''
  return t
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

const isUsefulEntityKey = (rawKey: string): boolean => {
  const key = String(rawKey || '').trim()
  if (!key) return false
  const lower = key.toLowerCase()
  if (NLTK_STOPWORDS_EN_SET.has(lower)) return false
  if (key.length <= 1) return /\d/.test(key)
  if (/^\d+$/.test(key)) return false
  if (/^[_-]+$/.test(key)) return false
  return true
}

const mergeTextEntities = (...groups: Array<Array<{ text: string; label: string; start: number; end: number }>>): TextEntity[] => {
  const seen = new Set<string>()
  const out: TextEntity[] = []
  for (let g = 0; g < groups.length; g += 1) {
    const group = groups[g] || []
    for (let i = 0; i < group.length; i += 1) {
      const e = group[i]!
      const key = normalizeEntityKey(e.text)
      if (!isUsefulEntityKey(key)) continue
      const start = typeof e.start === 'number' && Number.isFinite(e.start) ? e.start : -1
      const end = typeof e.end === 'number' && Number.isFinite(e.end) ? e.end : start
      if (start < 0) continue
      const sig = `${key}@${start}`
      if (seen.has(sig)) continue
      seen.add(sig)
      out.push({ text: e.text, label: e.label as TextEntity['label'], start, end })
    }
  }
  return out
}

const readCandidateBoost = (candidate: DocumentKeywordCandidate | undefined): number => {
  if (!candidate) return 0
  const frequency = typeof candidate.frequency === 'number' && Number.isFinite(candidate.frequency) ? candidate.frequency : 0
  const score = typeof candidate.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0
  return Math.max(1, Math.min(24, Math.log1p(frequency) * 2 + score * 6))
}

export const deriveKeywordGraphFromText = (source: KeywordGraphSource): KeywordGraphResult => {
  const docId = String(source.documentId || 'doc')
  const text = String(source.documentText || '')
  const analysisText = text.length > 60_000 ? text.slice(0, 60_000) : text
  const rawSourceHash = typeof source.sourceTextHash === 'string' && source.sourceTextHash.trim()
    ? source.sourceTextHash.trim()
    : hashText(text)
  const sourceLayerHash = `kw:v${KEYWORD_GRAPH_ALGO_VERSION}:${rawSourceHash}`
  const annotationPropertiesByKey = readKeywordAnnotationPropertiesByKey(source.markdownAnnotations, isUsefulEntityKey)
  
  const keywordCandidates = extractDocumentKeywordCandidates(analysisText)
  const keywordCandidateByKey = new Map<string, DocumentKeywordCandidate>()
  for (let i = 0; i < keywordCandidates.length; i += 1) keywordCandidateByKey.set(keywordCandidates[i]!.key, keywordCandidates[i]!)
  const textEntities = mergeTextEntities(
    extractMentionsRobust(analysisText),
    buildKeywordCandidateMentions(keywordCandidates),
  )
  const mentions: Mention[] = textEntities.map(e => ({
    key: normalizeEntityKey(e.text),
    label: e.text,
    start: e.start,
    end: e.end,
    ner: e.label,
  })).sort((a, b) => {
    const am = (a.start + a.end) / 2
    const bm = (b.start + b.end) / 2
    const diff = am - bm
    if (diff !== 0) return diff
    return a.key.localeCompare(b.key)
  })

  const entityByKey = new Map<string, { id: string; label: string; count: number; ner?: string }>()
  for (let i = 0; i < mentions.length; i += 1) {
    const m = mentions[i]!
    const key = m.key
    if (!isUsefulEntityKey(key)) continue
    const existing = entityByKey.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    const id = `kw:entity:${hashText(key)}`
    entityByKey.set(key, { id, label: m.label || prettyLabel(key) || key, count: 1, ner: m.ner })
  }

  keywordCandidateByKey.forEach((candidate, key) => {
    if (!isUsefulEntityKey(key)) return
    const boost = readCandidateBoost(candidate)
    const existing = entityByKey.get(key)
    if (existing) {
      existing.count += boost
      if (candidate.score > 0 && candidate.label.length > existing.label.length) existing.label = candidate.label
      return
    }
    entityByKey.set(key, {
      id: `kw:entity:${hashText(key)}`,
      label: candidate.label || prettyLabel(key) || key,
      count: Math.max(1, candidate.frequency + boost),
      ner: 'ENTITY',
    })
  })

  const pairCounts = new Map<string, number>()
  const entityBlockCounts = new Map<string, number>()
  const relationCountsByPair = new Map<string, Map<string, number>>()
  const predicateKeys = new Set<string>()
  const roleCountsByEntityKey = new Map<string, { subject: number; object: number }>()
  const directionCountsByPair = new Map<string, Map<string, number>>()

  // 1. Process explicit triples first for strong signals
  const explicitTriples = extractTriplesHeuristic(analysisText, textEntities)
  const cooccurrenceTriples = extractCooccurrencePairs(analysisText, textEntities)
  
  // Merge all signals
  const allTriples = [...explicitTriples.map(t => ({ ...t, weight: 3 })), ...cooccurrenceTriples.map(t => ({ ...t, weight: 1 }))]

  for (const t of allTriples) {
    const sKey = normalizeEntityKey(t.subject)
    const oKey = normalizeEntityKey(t.object)
    const pKey = normalizeEntityKey(t.predicate)
    if (!sKey || !oKey || !pKey) continue
    if (!isUsefulEntityKey(sKey) || !isUsefulEntityKey(oKey) || !isUsefulEntityKey(pKey)) continue
    
    // Ensure nodes exist
    if (!entityByKey.has(sKey)) {
        const id = `kw:entity:${hashText(sKey)}`
        entityByKey.set(sKey, { id, label: t.subject, count: 1 })
    }
    if (!entityByKey.has(oKey)) {
        const id = `kw:entity:${hashText(oKey)}`
        entityByKey.set(oKey, { id, label: t.object, count: 1 })
    }
    
    // Boost counts based on signal strength
    const sNode = entityByKey.get(sKey)!
    sNode.count += t.weight
    const oNode = entityByKey.get(oKey)!
    oNode.count += t.weight

    // Record pair
    const pairKey = sKey.localeCompare(oKey) < 0 ? `${sKey}|${oKey}` : `${oKey}|${sKey}`
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + t.weight)

    // Record relation
    const relMap = relationCountsByPair.get(pairKey) || new Map<string, number>()
    relMap.set(pKey, (relMap.get(pKey) || 0) + t.weight)
    relationCountsByPair.set(pairKey, relMap)
    predicateKeys.add(pKey)

    // Record roles
    const sRole = roleCountsByEntityKey.get(sKey) || { subject: 0, object: 0 }
    sRole.subject += t.weight
    roleCountsByEntityKey.set(sKey, sRole)
    const oRole = roleCountsByEntityKey.get(oKey) || { subject: 0, object: 0 }
    oRole.object += t.weight
    roleCountsByEntityKey.set(oKey, oRole)

    // Record direction
    const dirKey = `${sKey}|${oKey}`
    const dirMap = directionCountsByPair.get(pairKey) || new Map<string, number>()
    dirMap.set(dirKey, (dirMap.get(dirKey) || 0) + t.weight)
    directionCountsByPair.set(pairKey, dirMap)
  }

  if (pairCounts.size === 0 && entityByKey.size >= 2) {
    const keysInOrder: string[] = []
    for (let i = 0; i < mentions.length; i += 1) {
      const key = mentions[i]?.key
      if (!key) continue
      if (!isUsefulEntityKey(key)) continue
      keysInOrder.push(key)
    }
    const windowSize = 6
    const pred = 'relatedTo'
    const pKey = normalizeEntityKey(pred)
    if (pKey) {
      predicateKeys.add(pKey)
      for (let i = 0; i < keysInOrder.length; i += 1) {
        const a = keysInOrder[i]!
        for (let j = Math.max(0, i - windowSize); j < i; j += 1) {
          const b = keysInOrder[j]!
          if (!a || !b || a === b) continue
          const pairKey = a.localeCompare(b) < 0 ? `${a}|${b}` : `${b}|${a}`
          pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1)
          const relMap = relationCountsByPair.get(pairKey) || new Map<string, number>()
          relMap.set(pKey, (relMap.get(pKey) || 0) + 1)
          relationCountsByPair.set(pairKey, relMap)
          const aNode = entityByKey.get(a)
          const bNode = entityByKey.get(b)
          if (aNode) aNode.count += 1
          if (bNode) bNode.count += 1
        }
      }
    }
  }

  // Record block counts for PPMI
  const sentenceRanges = splitSentencesWithOffsets(analysisText)
  for (const range of sentenceRanges) {
    const sentenceEntities = textEntities.filter(e => e.start >= range.start && e.end <= range.end)
    const uniqueKeys = new Set(sentenceEntities.map(e => normalizeEntityKey(e.text)).filter(k => !!k && isUsefulEntityKey(k)))
    uniqueKeys.forEach(k => {
      entityBlockCounts.set(k, (entityBlockCounts.get(k) || 0) + 1)
    })
  }

  predicateKeys.forEach((p) => {
    const key = normalizeEntityKey(p)
    if (!key) return
    if (key.includes(' ')) return
    if (entityByKey.has(key)) entityByKey.delete(key)
  })

  const roleByEntityKey = new Map<string, 'subject' | 'object' | 'entity'>()
  entityByKey.forEach((_, key) => {
    const counts = roleCountsByEntityKey.get(key) || { subject: 0, object: 0 }
    const subj = counts.subject
    const obj = counts.object
    const role: 'subject' | 'object' | 'entity' = subj > obj ? 'subject' : obj > subj ? 'object' : 'entity'
    roleByEntityKey.set(key, role)
  })
  const rawEntityCount = entityByKey.size
  const maxKeywordNodes = readKeywordGraphMaxNodes(source.tuning?.maxNodes)
  const retainedEntityKeys = selectRetainedKeywordEntityKeys(
    Array.from(entityByKey.entries()).map(([key, value]) => {
      const candidate = keywordCandidateByKey.get(key)
      const roleCounts = roleCountsByEntityKey.get(key) || { subject: 0, object: 0 }
      return {
        key,
        count: value.count,
        candidateScore: candidate?.score,
        candidateRank: candidate?.rank,
        phraseLength: candidate?.phraseLength,
        roleWeight: roleCounts.subject + roleCounts.object,
      }
    }),
    maxKeywordNodes,
  )
  if (retainedEntityKeys.size < entityByKey.size) {
    entityByKey.forEach((_, key) => {
      if (!retainedEntityKeys.has(key)) entityByKey.delete(key)
    })
  }

  pairCounts.forEach((_, pairKey) => {
    const parts = pairKey.split('|')
    const a = parts[0] || ''
    const b = parts[1] || ''
    if (!a || !b) {
      pairCounts.delete(pairKey)
      relationCountsByPair.delete(pairKey)
      return
    }
    if (!entityByKey.has(a) || !entityByKey.has(b)) {
      pairCounts.delete(pairKey)
      relationCountsByPair.delete(pairKey)
    }
  })

  const nodes: GraphNode[] = []
  const nodeCountsById = new Map<string, number>()
  entityByKey.forEach((v, key) => {
    const count = v.count
    nodeCountsById.set(v.id, count)
    const nodeSize = keywordNodeSizeFromCount(count)
    const role = roleByEntityKey.get(key) || 'entity'
    const fill = KEYWORD_ROLE_COLORS[role]
    const candidate = keywordCandidateByKey.get(key)
    const annotationProperties = annotationPropertiesByKey.get(key)
    nodes.push({
      id: v.id,
      label: v.label,
      type: 'Keyword',
      properties: {
        'keyword:key': key as unknown as JSONValue,
        'keyword:kind': 'entity',
        'keyword:role': role,
        'keyword:ner': v.ner as unknown as JSONValue,
        'keyword:frequency': count as unknown as JSONValue,
        ...(candidate ? {
          'keyword:score': candidate.score as unknown as JSONValue,
          'keyword:rank': candidate.rank as unknown as JSONValue,
          'keyword:phraseLength': candidate.phraseLength as unknown as JSONValue,
          'keyword:spread': candidate.spread as unknown as JSONValue,
          'keyword:extractor': 'document-keyphrase' as unknown as JSONValue,
        } : {}),
        count: count as unknown as JSONValue,
        'visual:importance': count as unknown as JSONValue,
        'visual:nodeSize': nodeSize as unknown as JSONValue,
        'visual:fill': fill as unknown as JSONValue,
        fill: fill as unknown as JSONValue,
        tags: [role === 'object' ? 'execution' : 'idea'] as unknown as JSONValue,
        ...(annotationProperties || {}),
      },
      metadata: {
        derived: true,
        kind: 'keyword',
        source: docId,
      },
    })
  })
  nodes.sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const ppmi = computePpmi({ pairCounts, entityBlockCounts, blockCount: sentenceRanges.length })

  const edges: GraphEdge[] = []
  pairCounts.forEach((count, pairKey) => {
    const [a, b] = pairKey.split('|')
    if (!a || !b) return
    const rawSrc = entityByKey.get(a)?.id || ''
    const rawTgt = entityByKey.get(b)?.id || ''
    if (!rawSrc || !rawTgt) return
    let src = rawSrc
    let tgt = rawTgt
    const relMap = relationCountsByPair.get(pairKey) || new Map<string, number>()
    let bestRel = 'relates_to'
    let bestRelCount = -1
    relMap.forEach((c, rel) => {
      if (c > bestRelCount) {
        bestRelCount = c
        bestRel = rel
      } else if (c === bestRelCount && rel.localeCompare(bestRel) < 0) {
        bestRel = rel
      }
    })
    const dirMap = directionCountsByPair.get(pairKey) || new Map<string, number>()
    let bestDir: string | null = null
    let bestDirCount = -1
    dirMap.forEach((c, k) => {
      if (c > bestDirCount) {
        bestDirCount = c
        bestDir = k
      } else if (c === bestDirCount && k.localeCompare(bestDir || '') < 0) {
        bestDir = k
      }
    })
    if (bestDir) {
      const [subjKey, objKey] = bestDir.split('|')
      const subjId = subjKey ? (entityByKey.get(subjKey)?.id || '') : ''
      const objId = objKey ? (entityByKey.get(objKey)?.id || '') : ''
      if (subjId && objId) {
        src = subjId
        tgt = objId
      }
    }
    const w = ppmi.get(pairKey) || 0
    const width = deriveEdgeWidthFromStrength({ count, weight: w })
    const strengthScore = Math.max(0, Math.min(1, w / 3))
    const strokeAlpha = clampNumber(0.15 + strengthScore * 0.85, 0.15, 1)
    const stroke = `rgba(156, 163, 175, ${strokeAlpha.toFixed(3)})`
    const id = `kw:edge:${hashText(`${src}|${bestRel}|${tgt}`)}`
    edges.push({
      id,
      source: src,
      target: tgt,
      label: bestRel,
      properties: {
        count: count as unknown as JSONValue,
        weight: w as unknown as JSONValue,
        'strength:count': count as unknown as JSONValue,
        'strength:ppmi': w as unknown as JSONValue,
        'strength:score': strengthScore as unknown as JSONValue,
        'visual:weight': w as unknown as JSONValue,
        'visual:width': width as unknown as JSONValue,
        'visual:stroke': stroke as unknown as JSONValue,
        'keyword:kind': 'predicate',
        'keyword:predicate': bestRel as unknown as JSONValue,
        'keyword:verbLike': (isVerbLike(bestRel) ? true : false) as unknown as JSONValue,
        'keyword:directed': (bestDir ? true : false) as unknown as JSONValue,
      },
      metadata: {
        derived: true,
        kind: 'keyword',
        source: docId,
      },
    })
  })
  edges.sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const prunedEdges = (() => {
    const nodeCount = nodes.length
    const edgesPerNodeRaw = source.tuning?.edgesPerNode
    const requestedEdgesPerNode = typeof edgesPerNodeRaw === 'number' && Number.isFinite(edgesPerNodeRaw)
      ? clampNumber(Math.floor(edgesPerNodeRaw), 1, 60)
      : 6
    const edgesPerNode = nodeCount > 180 ? Math.min(requestedEdgesPerNode, 4) : requestedEdgesPerNode
    const maxEdgesCapRaw = source.tuning?.maxEdgesCap
    const requestedMaxEdgesCap = typeof maxEdgesCapRaw === 'number' && Number.isFinite(maxEdgesCapRaw)
      ? clampNumber(Math.floor(maxEdgesCapRaw), 0, 25_000)
      : 2400
    const maxEdgesCap = nodeCount > 180 ? Math.min(requestedMaxEdgesCap, 1200) : requestedMaxEdgesCap
    const maxEdges = Math.max(60, Math.min(maxEdgesCap, nodeCount * edgesPerNode))
    if (edges.length <= maxEdges) return edges
    const scored = edges
      .map(e => {
        const props = (e.properties || {}) as Record<string, unknown>
        const score = typeof props['strength:score'] === 'number' && Number.isFinite(props['strength:score']) ? (props['strength:score'] as number) : 0
        const count = typeof props['strength:count'] === 'number' && Number.isFinite(props['strength:count']) ? (props['strength:count'] as number) : 0
        return { e, score, count }
      })
      .sort((a, b) => b.score - a.score || b.count - a.count || String(a.e.id).localeCompare(String(b.e.id)))
    const kept = scored.slice(0, maxEdges).map(x => x.e)
    kept.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    return kept
  })()

  const undirectedNeighbors = new Map<string, string[]>()
  const weightedNeighbors = new Map<string, WeightedNeighbor[]>()
  for (let i = 0; i < prunedEdges.length; i += 1) {
    const e = prunedEdges[i]!
    const s = String(e.source || '')
    const t = String(e.target || '')
    if (!s || !t) continue
    const sArr = undirectedNeighbors.get(s) || []
    sArr.push(t)
    undirectedNeighbors.set(s, sArr)
    const tArr = undirectedNeighbors.get(t) || []
    tArr.push(s)
    undirectedNeighbors.set(t, tArr)

    const props = (e.properties || {}) as Record<string, unknown>
    const wRaw = typeof props['strength:ppmi'] === 'number' && Number.isFinite(props['strength:ppmi']) ? (props['strength:ppmi'] as number) : null
    const w = wRaw != null && wRaw > 0 ? wRaw : 0
    if (w > 0) {
      const sW = weightedNeighbors.get(s) || []
      sW.push({ id: t, w })
      weightedNeighbors.set(s, sW)
      const tW = weightedNeighbors.get(t) || []
      tW.push({ id: s, w })
      weightedNeighbors.set(t, tW)
    }
  }

  const entityNodeIds = nodes.map(n => String(n.id))
  const lpa = computeLabelPropagationCommunities({
    nodeIds: entityNodeIds,
    neighbors: weightedNeighbors,
    iterations: entityNodeIds.length > 300 ? 8 : 14,
  })
  const communityByNodeId = compressCommunityLabels({
    labelsByNodeId: lpa,
    neighbors: weightedNeighbors,
    maxCommunities: entityNodeIds.length > 250 ? 14 : 18,
  })
  const pr = computePageRank({ nodeIds: entityNodeIds, neighbors: undirectedNeighbors, iterations: 24, damping: 0.85 })
  nodes.forEach((n) => {
    const id = String(n.id)
    const cid = communityByNodeId.get(id)
    const rank = pr.get(id) || 0
    const props = (n.properties || {}) as Record<string, unknown>
    const count = typeof props.count === 'number' && Number.isFinite(props.count) ? props.count : 0
    const importance = count + rank * 10
    n.properties = {
      ...(n.properties || {}),
      'keyword:pagerank': rank as unknown as JSONValue,
      'visual:importance': importance as unknown as JSONValue,
      ...(cid == null ? {} : { 'visual:community': cid as unknown as JSONValue, 'visual:layer': cid as unknown as JSONValue }),
    }
  })

  const cloudPlacements = computeKeywordCloudPlacements(nodes.map((n, index) => {
    const props = (n.properties || {}) as Record<string, unknown>
    const importance = typeof props['visual:importance'] === 'number' && Number.isFinite(props['visual:importance'])
      ? (props['visual:importance'] as number)
      : typeof props.count === 'number' && Number.isFinite(props.count)
        ? (props.count as number)
        : 0
    return {
      id: String(n.id),
      label: String(n.label || ''),
      weight: importance,
      rank: typeof props['keyword:rank'] === 'number' && Number.isFinite(props['keyword:rank']) ? (props['keyword:rank'] as number) : index + 1,
    }
  }))
  nodes.forEach((n) => {
    const p = cloudPlacements.get(String(n.id))
    if (!p) return
    n.properties = {
      ...(n.properties || {}),
      'visual:wordCloud': true as unknown as JSONValue,
      'visual:fontSize': p.fontSizePx as unknown as JSONValue,
      'visual:labelRotation': p.rotateDeg as unknown as JSONValue,
      'visual:xIndex': p.xIndex as unknown as JSONValue,
      'visual:yIndex': p.yIndex as unknown as JSONValue,
      'visual:opacity': p.opacity as unknown as JSONValue,
    }
  })

  const graphBase: GraphData = {
    type: 'Graph',
    context: '',
    metadata: {
      derived: true,
      kind: 'keyword',
      source: docId,
      sourceLayerHash: sourceLayerHash as unknown as JSONValue,
      sourceLabel: (source.sourceLabel || '') as unknown as JSONValue,
      keywordCandidateCount: keywordCandidates.length as unknown as JSONValue,
      keywordCloudLayout: 'semantic-spiral' as unknown as JSONValue,
      rawKeywordNodeCount: rawEntityCount as unknown as JSONValue,
      keywordNodeCount: nodes.length as unknown as JSONValue,
      keywordNodeLimit: maxKeywordNodes as unknown as JSONValue,
      keywordNodePrunedCount: Math.max(0, rawEntityCount - nodes.length) as unknown as JSONValue,
      keywordHighlightedCount: countHighlightedKeywordNodes(nodes) as unknown as JSONValue,
    },
    nodes,
    edges: prunedEdges,
  }

  const graph = withGraphTopologyMetadata({
    graphData: graphBase,
    stage: 'keyword',
    annotate: true,
  }) || graphBase

  return { graph, nodeCountsById }
}
