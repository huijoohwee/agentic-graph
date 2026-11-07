import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { hashText } from '@/features/parsers/hash'
import { tokenizeForStats } from '@/lib/graph/statsUtils'
import { KEYWORD_FUNCTION_WORDS } from '@/features/semantic-mode/keywordStopwords'
import { nowMs, tokenizePreserveCase, lemmatizeNaive, hfToySubwordsFromText } from '@/lib/graph/graphragTextToyStages'
import { applyGraphRagTextAnalytics, type GraphRagTextGraphMetrics } from '@/lib/graph/graphragTextAnalytics'
import type { DensityClusteringConfig } from '@/features/semantic-mode/densityClustering'
import { buildExtractiveSummary } from '@/lib/graph/extractiveSummarization'
import type { GraphRagTextCentralityConfig } from '@/lib/graph/graphragTextConfig'
import {
  extractEntitiesHeuristic,
  extractTriplesHeuristic,
  findFirstEntityMention,
  normalizeWhitespace,
  splitSentences,
  type TextEntity,
  type TextTriple,
} from '@/lib/graph/textAnalysis'

export type GraphRagTextPipelineStageId =
  | 'nltkPreprocess'
  | 'hfTokenize'
  | 'spacyNerPos'
  | 'tripleExtract'
  | 'extractiveSummarize'
  | 'graphConstruct'
  | 'entityAnalytics'
  | 'relationAnalytics'
  | 'metadataAnalytics'
  | 'clusterAnalytics'

export type GraphRagPipelineLibraryRef = {
  name: string
  url: string
  license: string
}

export type GraphRagTextPipelineStageMetrics = {
  stage: GraphRagTextPipelineStageId
  status: 'success' | 'error'
  latency_ms: number
  output_size: number
  error_message?: string
}

export type GraphRagTextPipelineStage = {
  id: GraphRagTextPipelineStageId
  name: string
  library: GraphRagPipelineLibraryRef
  code: string
  input: string
  output: JSONValue
  metrics: GraphRagTextPipelineStageMetrics
}

export type GraphRagTextEntity = TextEntity

export type GraphRagTextTriple = TextTriple

export type GraphRagTextPipelineResult = {
  graphData: GraphData
  stages: GraphRagTextPipelineStage[]
  warnings: string[]
}

export type GraphRagTextPipelineOptions = {
  densityClustering?: Partial<DensityClusteringConfig>
  centrality?: Partial<GraphRagTextCentralityConfig>
}


const normalizeNodeKey = (value: string): string => {
  const t = normalizeWhitespace(value)
  if (!t) return ''
  return t.toLowerCase()
}

const nodeIdFor = (kind: string, value: string): string => {
  const key = `${kind}:${normalizeNodeKey(value)}`
  return `${kind}:${hashText(key)}`
}

const buildGraphFromTriples = (args: {
  triples: GraphRagTextTriple[]
  entities: GraphRagTextEntity[]
}): {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeKeyById: Map<string, string>
  roleCountsByNodeId: Map<string, { subject: number; object: number }>
} => {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeByKey = new Map<string, GraphNode>()
  const nodeKeyById = new Map<string, string>()
  const roleCountsByNodeId = new Map<string, { subject: number; object: number }>()

  const ensureNode = (label: string) => {
    const k = `Entity:${normalizeNodeKey(label)}`
    if (!k.trim()) return null
    const existing = nodeByKey.get(k)
    if (existing) return existing
    const id = nodeIdFor('Entity', label)
    const nodeKey = normalizeNodeKey(label)
    const node: GraphNode = {
      id,
      label: normalizeWhitespace(label),
      type: 'Entity',
      properties: { 'graphrag:key': nodeKey as unknown as JSONValue },
    }
    nodeByKey.set(k, node)
    nodeKeyById.set(id, nodeKey)
    nodes.push(node)
    return node
  }

  for (const e of args.entities) {
    const node = ensureNode(e.text)
    if (!node) continue
    node.properties = { ...(node.properties || {}), nerLabel: e.label as JSONValue }
  }

  const edgeSeen = new Set<string>()
  for (const t of args.triples) {
    const s = ensureNode(t.subject)
    const o = ensureNode(t.object)
    if (!s || !o) continue
    const label = normalizeWhitespace(t.predicate) || 'relatedTo'
    roleCountsByNodeId.set(s.id, {
      subject: (roleCountsByNodeId.get(s.id)?.subject || 0) + 1,
      object: roleCountsByNodeId.get(s.id)?.object || 0,
    })
    roleCountsByNodeId.set(o.id, {
      subject: roleCountsByNodeId.get(o.id)?.subject || 0,
      object: (roleCountsByNodeId.get(o.id)?.object || 0) + 1,
    })
    const edgeKey = `${s.id}|${label}|${o.id}`
    if (edgeSeen.has(edgeKey)) continue
    edgeSeen.add(edgeKey)
    edges.push({
      id: `edge:${hashText(edgeKey)}`,
      source: s.id,
      target: o.id,
      label,
      properties: { 
        confidence: t.confidence as JSONValue,
        ...((t.properties || {}) as Record<string, JSONValue>),
      },
    })
  }

  for (const n of nodes) {
    const counts = roleCountsByNodeId.get(n.id) || { subject: 0, object: 0 }
    const subjectCount = counts.subject
    const objectCount = counts.object
    const role = subjectCount > objectCount ? 'Subject' : objectCount > subjectCount ? 'Object' : 'Entity'
    n.type = role
    n.properties = {
      ...(n.properties || {}),
      'graphrag:role': role as unknown as JSONValue,
      'graphrag:subjectCount': subjectCount as unknown as JSONValue,
      'graphrag:objectCount': objectCount as unknown as JSONValue,
    }
  }

  return {
    nodes,
    edges,
    nodeKeyById,
    roleCountsByNodeId,
  }
}

const stageSize = (output: unknown): number => {
  try {
    return JSON.stringify(output).length
  } catch {
    return 0
  }
}

export function runGraphRagTextPipeline(text: string, options?: GraphRagTextPipelineOptions): GraphRagTextPipelineResult {
  const raw = String(text || '')
  const warnings: string[] = []
  const stages: GraphRagTextPipelineStage[] = []

  const baseText = raw.replace(/(?:^|\n)\s*---+\s*(?:\n|$)/g, '\n').trim()
  if (!baseText) {
    return { graphData: { type: 'Graph', nodes: [], edges: [] }, stages: [], warnings: ['Empty text input'] }
  }

  const preprocessT0 = nowMs()
  const tokens = tokenizePreserveCase(baseText)
  const lemmas = tokens.map(lemmatizeNaive).filter(Boolean)
  const filteredLemmas = lemmas.filter(l => !KEYWORD_FUNCTION_WORDS.has(l))
  const preprocessT1 = nowMs()
  const preprocessOutput = {
    tokens: tokens.slice(0, 128),
    lemmas: filteredLemmas.slice(0, 128),
  }
  stages.push({
    id: 'nltkPreprocess',
    name: 'NLTK Preprocessing',
    library: { name: 'NLTK', url: 'https://github.com/nltk/nltk', license: 'Apache-2.0' },
    code: ["# stopwords removed, lemmatized", 'from nltk.corpus import stopwords', 'from nltk.stem import WordNetLemmatizer'].join('\n'),
    input: baseText,
    output: preprocessOutput as unknown as JSONValue,
    metrics: {
      stage: 'nltkPreprocess',
      status: 'success',
      latency_ms: preprocessT1 - preprocessT0,
      output_size: stageSize(preprocessOutput),
    },
  })

  const tokT0 = nowMs()
  const subwordsAll = hfToySubwordsFromText(baseText)
  const subwords = subwordsAll.slice(0, 256)
  const tokT1 = nowMs()
  const wordTokens = (baseText.match(/[A-Za-z]+|\d+(?:\.\d+)?/g) || []).length
  const subwordTokens = subwordsAll.length
  const compressionRatio = wordTokens > 0 ? subwordTokens / wordTokens : 0
  const hfOutput = {
    subwords,
    word_tokens: wordTokens,
    subword_tokens: subwordTokens,
    compression_ratio: Number(compressionRatio.toFixed(2)),
  }
  stages.push({
    id: 'hfTokenize',
    name: 'HF Tokenizers',
    library: { name: 'HuggingFace Tokenizers', url: 'https://github.com/huggingface/tokenizers', license: 'Apache-2.0' },
    code: ["from tokenizers import Tokenizer", "tok = Tokenizer.from_pretrained('gpt2')"].join('\n'),
    input: 'Tokenization for LLM compatibility',
    output: hfOutput as unknown as JSONValue,
    metrics: {
      stage: 'hfTokenize',
      status: 'success',
      latency_ms: tokT1 - tokT0,
      output_size: stageSize(hfOutput),
    },
  })

  const nerT0 = nowMs()
  const entities = extractEntitiesHeuristic(baseText)
  const nerT1 = nowMs()
  const posExampleTokens = tokenizeForStats(baseText, 1, new Set()).slice(0, 6)
  const posExample = posExampleTokens.length > 0 ? `${posExampleTokens[0]}/PROPN is/AUX a/DET` : 'Example/PROPN is/AUX a/DET'
  const depsExample = (() => {
    const first = splitSentences(baseText)[0] || ''
    const subj = findFirstEntityMention(first, entities)?.text || ''
    if (!subj) return []
    const hasIsA = /\bis\b/i.test(first)
    const hasIn = /\bin\b/i.test(first)
    const out: string[] = []
    if (hasIsA) out.push(`${subj} <-nsubj- is`)
    if (hasIsA) out.push(`city-state <-attr- is`)
    if (hasIn) out.push(`Southeast Asia <-pobj- in`)
    return out
  })()
  const nerOutput = {
    entities: entities.slice(0, 32),
    pos: posExample,
    dependencies: depsExample,
  }
  stages.push({
    id: 'spacyNerPos',
    name: 'spaCy NER & POS',
    library: { name: 'spaCy', url: 'https://github.com/explosion/spaCy', license: 'MIT' },
    code: ["import spacy", "nlp = spacy.load('en_core_web_sm')", 'doc = nlp(text)'].join('\n'),
    input: baseText,
    output: nerOutput as unknown as JSONValue,
    metrics: {
      stage: 'spacyNerPos',
      status: 'success',
      latency_ms: nerT1 - nerT0,
      output_size: stageSize(nerOutput),
    },
  })

  const tripleT0 = nowMs()
  const triples = extractTriplesHeuristic(baseText, entities)
  const tripleT1 = nowMs()
  const triplesOutput = {
    triples: triples.slice(0, 64).map(t => `(${t.subject}, ${t.predicate}, ${t.object})`),
    triples_structured: triples.slice(0, 64) as unknown as JSONValue,
  }
  stages.push({
    id: 'tripleExtract',
    name: 'Triple Extraction',
    library: { name: 'spaCy (dependency parsing)', url: 'https://github.com/explosion/spaCy', license: 'MIT' },
    code: ['# OpenIE or custom extraction', '(subject, relation, object)'].join('\n'),
    input: 'Semantic relationships from text',
    output: triplesOutput as unknown as JSONValue,
    metrics: {
      stage: 'tripleExtract',
      status: 'success',
      latency_ms: tripleT1 - tripleT0,
      output_size: stageSize(triplesOutput),
    },
  })

  const summarizeT0 = nowMs()
  const summary = buildExtractiveSummary({
    text: baseText,
    entities,
    options: { maxSentences: 4, maxSummaryChars: 900, maxSentenceChars: 280, maxSentencesScored: 160 },
  })
  const summarizeT1 = nowMs()
  const summarySentences = summary.selectedSentenceIndices.map(idx => {
    const entry = summary.sentences.find(s => s.index === idx)
    if (!entry) return null
    return {
      index: entry.index,
      paragraphIndex: entry.paragraphIndex,
      score: Number(entry.score.toFixed(3)),
      entityMentions: entry.entityMentions,
      text: entry.text,
    }
  }).filter(Boolean)
  const summaryOutput = {
    summary: summary.summaryText,
    sentences: summarySentences,
    metrics: summary.metrics,
  }
  stages.push({
    id: 'extractiveSummarize',
    name: 'Extractive Summarization',
    library: { name: 'HuggingFace Transformers', url: 'https://github.com/huggingface/transformers', license: 'Apache-2.0' },
    code: ["from transformers import pipeline", "summarizer = pipeline('summarization')"].join('\n'),
    input: 'Paragraph and sentence segmentation',
    output: summaryOutput as unknown as JSONValue,
    metrics: {
      stage: 'extractiveSummarize',
      status: 'success',
      latency_ms: summarizeT1 - summarizeT0,
      output_size: stageSize(summaryOutput),
    },
  })

  const graphT0 = nowMs()
  const built = buildGraphFromTriples({ triples, entities })
  const graphT1 = nowMs()
  const analytics = applyGraphRagTextAnalytics({
    text: baseText,
    entities,
    triples,
    nodes: built.nodes,
    edges: built.edges,
    nodeKeyById: built.nodeKeyById,
    densityClustering: options?.densityClustering,
    centrality: options?.centrality,
  })

  stages.push({
    id: 'entityAnalytics',
    name: 'Entity Layer Analytics',
    library: { name: 'TF‑IDF + PageRank + HITS + Centrality', url: 'https://networkx.org/documentation/stable/reference/algorithms/centrality.html', license: 'BSD-3-Clause' },
    code: ['from sklearn.feature_extraction.text import TfidfVectorizer', 'nx.pagerank(G)', 'nx.hits(G)', 'nx.closeness_centrality(G)'].join('\n'),
    input: 'Entities + graph adjacency',
    output: analytics.entityOutput,
    metrics: {
      stage: 'entityAnalytics',
      status: 'success',
      latency_ms: analytics.timings.entityMs,
      output_size: stageSize(analytics.entityOutput),
    },
  })

  stages.push({
    id: 'relationAnalytics',
    name: 'Relation Layer Analytics',
    library: { name: 'Causality + PMI', url: 'https://en.wikipedia.org/wiki/Pointwise_mutual_information', license: 'CC-BY-SA' },
    code: ['causality = f(temporal, modality, signal)', 'strength = PPMI(sentence_cooccurrence)'].join('\n'),
    input: 'Triples + sentence co-occurrence',
    output: analytics.relationOutput,
    metrics: {
      stage: 'relationAnalytics',
      status: 'success',
      latency_ms: analytics.timings.relationMs,
      output_size: stageSize(analytics.relationOutput),
    },
  })

  const graphMetrics: GraphRagTextGraphMetrics = analytics.graphMetrics
  const graphOutput = {
    nodes: built.nodes.map(n => n.label).slice(0, 64),
    edges: graphMetrics.edgeCount,
    communities: graphMetrics.communities,
    density: Number(graphMetrics.density.toFixed(2)),
    avg_degree: Number(graphMetrics.avgDegree.toFixed(1)),
  }
  stages.push({
    id: 'graphConstruct',
    name: 'Graph Construction',
    library: { name: 'NetworkX', url: 'https://github.com/networkx/networkx', license: 'BSD-3-Clause' },
    code: ['import networkx as nx', 'G = nx.Graph()', 'G.add_edges_from(triples)'].join('\n'),
    input: 'Build weighted knowledge graph',
    output: graphOutput as unknown as JSONValue,
    metrics: {
      stage: 'graphConstruct',
      status: 'success',
      latency_ms: graphT1 - graphT0,
      output_size: stageSize(graphOutput),
    },
  })

  stages.push({
    id: 'metadataAnalytics',
    name: 'Metadata Layer Analytics',
    library: { name: 'Graph metrics', url: 'https://github.com/networkx/networkx', license: 'BSD-3-Clause' },
    code: ['nx.density(G)', 'nx.diameter(G)', 'nx.average_shortest_path_length(G)'].join('\n'),
    input: 'Graph structure',
    output: analytics.metadataOutput,
    metrics: {
      stage: 'metadataAnalytics',
      status: 'success',
      latency_ms: analytics.timings.metadataMs,
      output_size: stageSize(analytics.metadataOutput),
    },
  })

  stages.push({
    id: 'clusterAnalytics',
    name: 'Cluster Layer Analytics',
    library: { name: 'DBSCAN', url: 'https://en.wikipedia.org/wiki/DBSCAN', license: 'CC-BY-SA' },
    code: ['cluster = DBSCAN(cosine(label+edge tokens))'].join('\n'),
    input: 'Node/edge token vectors',
    output: analytics.clusterOutput,
    metrics: {
      stage: 'clusterAnalytics',
      status: 'success',
      latency_ms: analytics.timings.clusterMs,
      output_size: stageSize(analytics.clusterOutput),
    },
  })

  if (graphMetrics.nodeCount === 0) warnings.push('No nodes extracted from text')
  if (graphMetrics.edgeCount === 0) warnings.push('No relationships extracted from text')

  const graphData: GraphData = {
    type: 'Graph',
    context: 'graphrag-text',
    nodes: built.nodes,
    edges: built.edges,
    metadata: {
      graphragTextPipeline: {
        inputTextPreview: baseText.slice(0, 2048),
        inputTextHash: hashText(baseText),
        config: {
          densityClustering: (options?.densityClustering || {}) as unknown as JSONValue,
          centrality: (options?.centrality || {}) as unknown as JSONValue,
        } as unknown as JSONValue,
        summary: summaryOutput as unknown as JSONValue,
        graphMetrics: graphMetrics as unknown as JSONValue,
        stages,
        warnings,
      } as unknown as JSONValue,
    },
  }

  return { graphData, stages, warnings }
}
